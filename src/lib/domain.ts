/**
 * PACT core — deterministic bounded matcher/checker and repair proposals.
 *
 * Pure functions over a Workspace snapshot: no clock, no randomness, no I/O.
 * The same input always produces the same result (including evidence paths).
 *
 * Matching rules (from the fictional Morrow Studio handoff):
 *  - An editor may work a commitment only through a recorded approval fact
 *    (approved = true). A missing record is UNKNOWN eligibility: the editor is
 *    never silently scheduled and the unknown is reported as an assumption.
 *  - One editor completes an entire commitment ("same editor per task").
 *  - Work is divisible into whole one-hour slots; slot s belongs to
 *    day floor(s / 8) + 1 (slots 0..7 = Day 1, 8..15 = Day 2; two-day scope).
 *  - Editing may only happen inside a commitment's window: release day <=
 *    day(slot) <= deadline day. Deadline moves are capped by flexUntilDay.
 *  - Agency events occupy creator time; the same creator cannot attend two
 *    overlapping events (attendance windows are end-exclusive).
 *  - Unknown durations (hours = null) are needs_information: never guessed.
 *
 * Bounds: at most MAX_COMMITMENTS commitments and MAX_HOURS_PER_TASK hours per
 * commitment are supported; larger inputs are rejected with invalid_request.
 * The scheduler is a bounded depth-first search with backtracking; if the
 * expansion budget is exhausted it reports "search_limit" instead of guessing.
 */
import { PactError } from './validation';
import type {
  Allocation, Approval, Campaign, CheckResult, Commitment, Day, Editor,
  EvidencePath, PlanChange, Proposal, Workspace,
} from './types';

/** Hard bound on matcher expansions so the checker always terminates. */
export const SEARCH_STEP_LIMIT = 50_000;
export const MAX_COMMITMENTS = 6;
export const MAX_HOURS_PER_TASK = 8;

/** Slots are one-hour; day = floor(slot / 8) + 1. */
export function dayOfSlot(slot: number): number {
  return Math.floor(slot / 8) + 1;
}

interface EligibilityIndex {
  /** campaignId -> editorId -> approval record with approved = true */
  approved: Map<string, Map<string, Approval>>;
  /** campaignId -> editorId -> approval record with approved = false (explicit block) */
  blocked: Map<string, Map<string, Approval>>;
}

function buildEligibility(workspace: Workspace): EligibilityIndex {
  const approved = new Map<string, Map<string, Approval>>();
  const blocked = new Map<string, Map<string, Approval>>();
  for (const a of workspace.approvals) {
    const target = a.approved ? approved : blocked;
    let inner = target.get(a.campaignId);
    if (!inner) {
      inner = new Map();
      target.set(a.campaignId, inner);
    }
    inner.set(a.editorId, a);
  }
  return { approved, blocked };
}

interface Working {
  commitment: Commitment;
  campaign: Campaign;
  releaseDay: Day;
  deadline: Day;
  hours: number | null;
  pinnedEditorId: string | null;
}

function prepare(workspace: Workspace, changes: PlanChange[], commitmentIds?: string[]): Working[] {
  if (workspace.commitments.length > MAX_COMMITMENTS) {
    throw new PactError(
      `Unsupported input: ${workspace.commitments.length} commitments exceed the supported bound of ${MAX_COMMITMENTS}.`,
      'invalid_request', 400,
    );
  }
  const editorIds = new Set(workspace.editors.map((e) => e.id));
  const changeByCommitment = new Map<string, PlanChange>();
  for (const change of changes) {
    const commitment = workspace.commitments.find((c) => c.id === change.commitmentId);
    if (!commitment) {
      throw new PactError(`changes reference unknown commitment "${change.commitmentId}".`, 'invalid_request', 400);
    }
    if (change.deadlineDay !== undefined) {
      if (change.deadlineDay > commitment.flexUntilDay || change.deadlineDay < commitment.releaseDay) {
        throw new PactError(
          `"${commitment.title}" may only run between Day ${commitment.releaseDay} and Day ${commitment.flexUntilDay}; ` +
          `a deadline of Day ${change.deadlineDay} exceeds the flexibility recorded in the brief.`,
          'invalid_request', 400,
        );
      }
    }
    if (change.editorId !== undefined && !editorIds.has(change.editorId)) {
      throw new PactError(`changes reference unknown editor "${change.editorId}".`, 'invalid_request', 400);
    }
    changeByCommitment.set(change.commitmentId, change);
  }
  let selected = workspace.commitments;
  if (commitmentIds) {
    const wanted = new Set(commitmentIds);
    for (const id of commitmentIds) {
      if (!workspace.commitments.some((c) => c.id === id)) {
        throw new PactError(`commitmentIds reference unknown commitment "${id}".`, 'invalid_request', 400);
      }
    }
    selected = workspace.commitments.filter((c) => wanted.has(c.id));
  }
  for (const commitment of selected) {
    if (commitment.hours !== null && (commitment.hours < 1 || commitment.hours > MAX_HOURS_PER_TASK)) {
      throw new PactError(
        `Unsupported input: "${commitment.title}" needs ${commitment.hours}h; tasks are bounded at ` +
        `1..${MAX_HOURS_PER_TASK} hours.`,
        'invalid_request', 400,
      );
    }
  }
  const campaigns = new Map(workspace.campaigns.map((c) => [c.id, c]));
  const working: Working[] = selected.map((commitment) => {
    const campaign = campaigns.get(commitment.campaignId);
    if (!campaign) {
      throw new PactError(
        `commitment "${commitment.id}" references unknown campaign "${commitment.campaignId}".`,
        'invalid_request', 400,
      );
    }
    const change = changeByCommitment.get(commitment.id);
    const deadline = (change?.deadlineDay ?? commitment.deadlineDay) as Day;
    return {
      commitment,
      campaign,
      releaseDay: commitment.releaseDay,
      deadline,
      hours: commitment.hours,
      pinnedEditorId: change?.editorId ?? null,
    };
  });
  // Most constrained first: earlier deadline, then longer, then stable by id.
  working.sort(
    (a, b) =>
      a.deadline - b.deadline ||
      (b.hours ?? 0) - (a.hours ?? 0) ||
      a.commitment.id.localeCompare(b.commitment.id),
  );
  return working;
}

/** Deterministic slot list for an editor, ascending and de-duplicated. */
function editorSlots(editor: Editor): number[] {
  return [...new Set(editor.slots)].sort((a, b) => a - b);
}

function freeSlots(editor: Editor, releaseDay: number, deadline: number, used: Set<number>): number[] {
  return editorSlots(editor).filter((s) => {
    const day = dayOfSlot(s);
    return day >= releaseDay && day <= deadline && !used.has(s);
  });
}

/**
 * availableHours = size of the UNION of (editor, slot) pairs that are eligible
 * for at least one selected commitment inside that commitment's window —
 * not the capacity of a single commitment, and never double-counting an
 * editor-hour that two campaigns could both draw on.
 */
function eligiblePairCount(working: Working[], editors: Editor[], elig: EligibilityIndex): number {
  const pairs = new Set<string>();
  for (const w of working) {
    for (const editor of editors) {
      if (!elig.approved.get(w.campaign.id)?.has(editor.id)) continue;
      for (const slot of editorSlots(editor)) {
        const day = dayOfSlot(slot);
        if (day >= w.releaseDay && day <= w.deadline) pairs.add(`${editor.id}#${slot}`);
      }
    }
  }
  return pairs.size;
}

interface SearchResult {
  allocations: Allocation[] | null;
  steps: number;
  /** deepest partial assignment reached, for honest diagnostics */
  deepestIndex: number;
  deepestAllocations: Allocation[];
}

function candidateEditorIds(w: Working, editors: Editor[], elig: EligibilityIndex): string[] {
  if (w.pinnedEditorId) {
    // A pinned editor must still hold a recorded approval fact; blocked or
    // unknown eligibility yields no candidates (reported honestly upstream).
    return elig.approved.get(w.campaign.id)?.has(w.pinnedEditorId) ? [w.pinnedEditorId] : [];
  }
  const approved = elig.approved.get(w.campaign.id);
  if (!approved) return [];
  return editors.map((e) => e.id).filter((id) => approved.has(id));
}

function searchOnce(working: Working[], editors: Editor[], elig: EligibilityIndex): SearchResult {
  const editorsById = new Map(editors.map((e) => [e.id, e]));
  const used = new Map<string, Set<number>>();
  for (const e of editors) used.set(e.id, new Set());
  const result: SearchResult = { allocations: null, steps: 0, deepestIndex: 0, deepestAllocations: [] };

  const recurse = (index: number, partial: Allocation[]): Allocation[] | null => {
    if (index > result.deepestIndex) {
      result.deepestIndex = index;
      result.deepestAllocations = [...partial];
    }
    if (index === working.length) return [];
    const w = working[index];
    const hours = w.hours ?? 0;
    for (const editorId of candidateEditorIds(w, editors, elig)) {
      const editor = editorsById.get(editorId);
      if (!editor) continue;
      const slots = freeSlots(editor, w.releaseDay, w.deadline, used.get(editorId)!);
      if (slots.length < hours) continue;
      const take = slots.slice(0, hours);
      result.steps += 1;
      if (result.steps > SEARCH_STEP_LIMIT) return null;
      const usedSet = used.get(editorId)!;
      for (const s of take) usedSet.add(s);
      const rest = recurse(index + 1, [...partial, { commitmentId: w.commitment.id, editorId, slots: take }]);
      if (rest !== null) return [{ commitmentId: w.commitment.id, editorId, slots: take }, ...rest];
      for (const s of take) usedSet.delete(s);
    }
    return null;
  };

  result.allocations = recurse(0, []);
  return result;
}

interface EventConflict {
  a: string;
  b: string;
  creatorId: string;
}

/**
 * The same creator cannot attend overlapping events; attendance windows are
 * end-exclusive, so [0,1) and [1,2) do NOT overlap. Only events belonging to
 * the checked campaigns are considered.
 */
function eventConflicts(workspace: Workspace, campaignIds: Set<string>): EventConflict[] {
  const byCreator = new Map<string, typeof workspace.events>();
  for (const event of workspace.events) {
    if (!campaignIds.has(event.campaignId)) continue;
    let list = byCreator.get(event.creatorId);
    if (!list) {
      list = [];
      byCreator.set(event.creatorId, list);
    }
    list.push(event);
  }
  const conflicts: EventConflict[] = [];
  for (const [creatorId, events] of byCreator) {
    const sorted = [...events].sort((a, b) => a.start - b.start || a.end - b.end || a.id.localeCompare(b.id));
    for (let i = 0; i < sorted.length; i++) {
      for (let j = i + 1; j < sorted.length; j++) {
        const a = sorted[i]!;
        const b = sorted[j]!;
        if (b.start < a.end && a.start < b.end) {
          conflicts.push({ a: a.id, b: b.id, creatorId });
        }
      }
    }
  }
  return conflicts.sort((x, y) => x.a.localeCompare(y.a));
}

function sourceTitle(workspace: Workspace, id: string): string {
  return workspace.sources.find((s) => s.id === id)?.title ?? id;
}

function unknownEligibilityAssumptions(workspace: Workspace, working: Working[], elig: EligibilityIndex): string[] {
  const lines: string[] = [];
  const seen = new Set<string>();
  for (const w of working) {
    for (const editor of workspace.editors) {
      const known = elig.approved.get(w.campaign.id)?.has(editor.id) || elig.blocked.get(w.campaign.id)?.has(editor.id);
      if (known) continue;
      const key = `${editor.id}|${w.campaign.id}`;
      if (seen.has(key)) continue;
      seen.add(key);
      lines.push(
        `Editor ${editor.name} (${editor.id}) has no approval record for campaign ${w.campaign.name} (${w.campaign.id}): ` +
        `eligibility is unknown, so PACT did not schedule them.`,
      );
    }
  }
  return lines.sort();
}

function blockedCandidateLines(workspace: Workspace, working: Working[], elig: EligibilityIndex): string[] {
  const lines: string[] = [];
  for (const w of working) {
    const blocked = elig.blocked.get(w.campaign.id);
    if (!blocked) continue;
    for (const [editorId, approval] of blocked) {
      const editor = workspace.editors.find((e) => e.id === editorId);
      if (!editor) continue;
      lines.push(
        `${editor.name} (${editorId}) is recorded as NOT approved for ${w.campaign.name} by ` +
        `"${sourceTitle(workspace, approval.sourceId)}" (${approval.id}).`,
      );
    }
  }
  return lines.sort();
}

function allocationEvidence(
  workspace: Workspace, working: Working[], allocations: Allocation[], elig: EligibilityIndex,
): EvidencePath[] {
  const byCommitment = new Map(working.map((w) => [w.commitment.id, w]));
  const editors = new Map(workspace.editors.map((e) => [e.id, e]));
  const paths: EvidencePath[] = [];
  for (const allocation of [...allocations].sort((a, b) => a.commitmentId.localeCompare(b.commitmentId))) {
    const w = byCommitment.get(allocation.commitmentId)!;
    const editor = editors.get(allocation.editorId)!;
    const approval = elig.approved.get(w.campaign.id)?.get(editor.id);
    if (!approval) continue; // the matcher only schedules approved editors
    const days = [...new Set(allocation.slots.map(dayOfSlot))].sort((a, b) => a - b).join(' and Day ');
    paths.push({
      id: `ev-${allocation.commitmentId}`,
      labels: ['Commitment', 'Campaign', 'Approval', 'Editor'],
      nodeIds: [w.commitment.id, w.campaign.id, approval.id, editor.id],
      sourceIds: [approval.sourceId, w.campaign.sourceId],
      explanation:
        `"${w.commitment.title}" (${w.commitment.id}) for ${w.campaign.name} is placed with ${editor.name} ` +
        `in slots [${allocation.slots.join(', ')}] (Day ${days}) under approval ${approval.id} ` +
        `from "${sourceTitle(workspace, approval.sourceId)}".`,
    });
  }
  return paths;
}

function windowCapacityLine(workspace: Workspace, w: Working, editors: Editor[], elig: EligibilityIndex): string {
  const capacity = editors
    .filter((e) => elig.approved.get(w.campaign.id)?.has(e.id))
    .map((e) => {
      const inWindow = editorSlots(e).filter((s) => {
        const day = dayOfSlot(s);
        return day >= w.releaseDay && day <= w.deadline;
      }).length;
      return `${e.name} ${inWindow}h in Day ${w.releaseDay}..${w.deadline}`;
    })
    .sort();
  return capacity.length > 0 ? capacity.join(', ') : 'no approved editors';
}

function failureEvidence(workspace: Workspace, w: Working, editors: Editor[], elig: EligibilityIndex): EvidencePath {
  const pinnedBlocked = w.pinnedEditorId ? elig.blocked.get(w.campaign.id)?.get(w.pinnedEditorId) : undefined;
  if (w.pinnedEditorId && pinnedBlocked) {
    const editor = editors.find((e) => e.id === w.pinnedEditorId);
    return {
      id: `ev-${w.commitment.id}`,
      labels: ['Commitment', 'Campaign', 'Approval', 'Editor'],
      nodeIds: [w.commitment.id, w.campaign.id, pinnedBlocked.id, w.pinnedEditorId],
      sourceIds: [pinnedBlocked.sourceId, w.campaign.sourceId],
      explanation:
        `Pinning "${w.commitment.title}" to ${editor?.name ?? w.pinnedEditorId} is blocked: ` +
        `approval ${pinnedBlocked.id} from "${sourceTitle(workspace, pinnedBlocked.sourceId)}" records them ` +
        `as not approved for ${w.campaign.name}.`,
    };
  }
  if (w.pinnedEditorId && !elig.approved.get(w.campaign.id)?.has(w.pinnedEditorId)) {
    const editor = editors.find((e) => e.id === w.pinnedEditorId);
    return {
      id: `ev-${w.commitment.id}`,
      labels: ['Commitment', 'Campaign', 'Editor'],
      nodeIds: [w.commitment.id, w.campaign.id, w.pinnedEditorId],
      sourceIds: [w.campaign.sourceId],
      explanation:
        `Pinning "${w.commitment.title}" to ${editor?.name ?? w.pinnedEditorId} is not possible: ` +
        `no approval fact exists for them on ${w.campaign.name}; PACT treats that as unknown and will not schedule them.`,
    };
  }
  return {
    id: `ev-${w.commitment.id}`,
    labels: ['Commitment', 'Campaign', 'Source'],
    nodeIds: [w.commitment.id, w.campaign.id, w.campaign.sourceId],
    sourceIds: [w.campaign.sourceId],
    explanation:
      `"${w.commitment.title}" (${w.commitment.id}) for ${w.campaign.name} needs ${w.hours}h inside its ` +
      `Day ${w.releaseDay}..${w.deadline} window ("${sourceTitle(workspace, w.campaign.sourceId)}"). ` +
      `Approved editor capacity in that window: ${windowCapacityLine(workspace, w, editors, elig)}.`,
  };
}

function eventConflictEvidence(workspace: Workspace, conflict: EventConflict): EvidencePath {
  const a = workspace.events.find((e) => e.id === conflict.a)!;
  const b = workspace.events.find((e) => e.id === conflict.b)!;
  const creator = workspace.creators.find((c) => c.id === conflict.creatorId);
  return {
    id: `ev-conflict-${conflict.a}-${conflict.b}`,
    labels: ['Event', 'Event', 'Creator'],
    nodeIds: [a.id, b.id, conflict.creatorId],
    sourceIds: [a.sourceId, b.sourceId],
    explanation:
      `${creator?.name ?? conflict.creatorId} (${conflict.creatorId}) cannot attend both "${a.title}" ` +
      `(hours ${a.start}-${a.end}) and "${b.title}" (hours ${b.start}-${b.end}): the windows overlap.`,
  };
}

function needsInformationEvidence(workspace: Workspace, w: Working): EvidencePath {
  return {
    id: `ev-${w.commitment.id}`,
    labels: ['Commitment', 'Campaign', 'Source'],
    nodeIds: [w.commitment.id, w.campaign.id, w.campaign.sourceId],
    sourceIds: [w.campaign.sourceId],
    explanation:
      `"${w.commitment.title}" (${w.commitment.id}) has no stated edit hours in ` +
      `"${sourceTitle(workspace, w.campaign.sourceId)}"; PACT will not guess a duration.`,
  };
}

const MODELING_ASSUMPTION =
  'Editing time is counted in whole one-hour slots; one editor completes an entire commitment; editing happens ' +
  'only between a commitment\'s release day and its deadline; agency events occupy creator time and the same ' +
  'creator cannot attend overlapping events (attendance windows are end-exclusive).';

/**
 * Check whether the plan (optionally with `changes` applied) can place every
 * selected commitment. Deterministic and bounded; never mutates the input.
 */
export function checkPlan(workspace: Workspace, changes: PlanChange[] = [], commitmentIds?: string[]): CheckResult {
  const working = prepare(workspace, changes, commitmentIds);
  const editors = [...workspace.editors].sort((a, b) => a.id.localeCompare(b.id));
  const elig = buildEligibility(workspace);
  const assumptions = [
    ...unknownEligibilityAssumptions(workspace, working, elig),
    ...blockedCandidateLines(workspace, working, elig),
    MODELING_ASSUMPTION,
  ];
  const known = working.filter((w) => w.hours !== null);
  const unknown = working.filter((w) => w.hours === null);
  const requiredHours = known.reduce((sum, w) => sum + (w.hours ?? 0), 0);
  const availableHours = eligiblePairCount(working, editors, elig);

  if (unknown.length > 0) {
    const issues = unknown
      .sort((a, b) => a.commitment.id.localeCompare(b.commitment.id))
      .map((w) =>
        `Unknown edit hours for "${w.commitment.title}" (${w.commitment.id}) on ${w.campaign.name}: ` +
        `the brief does not state a duration; ask the account manager before scheduling.`,
      );
    const summary =
      `Needs information: ${unknown.length} commitment${unknown.length === 1 ? '' : 's'} ` +
      `(${unknown.map((w) => w.commitment.id).sort().join(', ')}) ` +
      `ha${unknown.length === 1 ? 's' : 've'} unknown edit hours; PACT will not guess durations.`;
    return {
      status: 'needs_information',
      summary,
      requiredHours,
      availableHours,
      conflictIds: unknown.map((w) => w.commitment.id),
      issues,
      allocations: [],
      evidence: unknown.map((w) => needsInformationEvidence(workspace, w)),
      assumptions,
    };
  }

  // Creator calendar: overlapping events for the same creator block the plan.
  const selectedCampaignIds = new Set(working.map((w) => w.campaign.id));
  const conflicts = eventConflicts(workspace, selectedCampaignIds);
  if (conflicts.length > 0) {
    const issues = conflicts.map((c) => {
      const a = workspace.events.find((e) => e.id === c.a)!;
      const b = workspace.events.find((e) => e.id === c.b)!;
      const creator = workspace.creators.find((x) => x.id === c.creatorId);
      return (
        `${creator?.name ?? c.creatorId} (${c.creatorId}) cannot attend both "${a.title}" (hours ${a.start}-${a.end}) ` +
        `and "${b.title}" (hours ${b.start}-${b.end}): overlapping attendance windows. ` +
        `Move one event so the windows no longer overlap.`
      );
    });
    const summary =
      `Infeasible: the creator calendar has ${conflicts.length} overlapping event pair` +
      `${conflicts.length === 1 ? '' : 's'}; the same creator cannot be in two places at once.`;
    return {
      status: 'infeasible',
      summary,
      requiredHours,
      availableHours,
      conflictIds: conflicts.flatMap((c) => [c.a, c.b]).sort(),
      issues,
      allocations: [],
      evidence: conflicts.map((c) => eventConflictEvidence(workspace, c)),
      assumptions,
    };
  }

  const result = searchOnce(working, editors, elig);
  if (result.steps > SEARCH_STEP_LIMIT) {
    return {
      status: 'search_limit',
      summary: `Search limit reached after ${SEARCH_STEP_LIMIT} matcher steps; no plan was proven within the bound.`,
      requiredHours,
      availableHours,
      conflictIds: working.map((w) => w.commitment.id),
      issues: ['The bounded matcher exhausted its search budget before deciding feasibility.'],
      allocations: [],
      evidence: [],
      assumptions,
    };
  }

  if (result.allocations) {
    const allocations = [...result.allocations].sort((a, b) => a.commitmentId.localeCompare(b.commitmentId));
    const editorNames = [...new Set(allocations.map((a) => a.editorId))]
      .map((id) => editors.find((e) => e.id === id)?.name ?? id)
      .sort();
    const summary =
      working.length === 0
        ? 'Feasible: no commitments selected.'
        : `Feasible: ${working.length} commitment${working.length === 1 ? '' : 's'} (${requiredHours}h) ` +
          `placed with ${editorNames.join(' and ')}.`;
    return {
      status: 'feasible',
      summary,
      requiredHours,
      availableHours,
      conflictIds: [],
      issues: [],
      allocations,
      evidence: allocationEvidence(workspace, working, allocations, elig),
      assumptions,
    };
  }

  // Infeasible. Diagnose honestly: is this a joint conflict (any n-1 fit, all n
  // do not) or a specific commitment that cannot be placed?
  const ids = working.map((w) => w.commitment.id);
  const allSubsetsFit =
    working.length > 0 &&
    working.every((_, i) => {
      const subset = working.filter((_, j) => j !== i);
      return searchOnce(subset, editors, elig).allocations !== null;
    });

  if (allSubsetsFit && working.length > 1) {
    // Joint conflict: every pair/smaller combination fits; the whole set does not.
    const titles = working.map((w) => `"${w.commitment.title}"`).sort();
    const jointIssue =
      `Joint conflict: ${titles.join(', ')} cannot all be placed in their Day windows together — ` +
      `dropping any one of them makes the rest feasible. This is a combined capacity problem, not a ` +
      `single broken commitment.`;
    const issues = [
      jointIssue,
      ...working
        .slice()
        .sort((a, b) => a.commitment.id.localeCompare(b.commitment.id))
        .map((w) =>
          `"${w.commitment.title}" (${w.commitment.id}) needs ${w.hours}h in its Day ${w.releaseDay}..${w.deadline} ` +
          `window; approved editor capacity in that window: ${windowCapacityLine(workspace, w, editors, elig)}.`,
        ),
    ];
    const summary =
      `Infeasible: ${requiredHours}h of editing is due but the union of approved editor-hours in the relevant ` +
      `windows is ${availableHours}h; ${titles.length === working.length && working.length > 0 ? titles.join(', ') : 'the plan'} ` +
      `conflict jointly — any ${working.length - 1} of them fit, all ${working.length} do not.`;
    return {
      status: 'infeasible',
      summary,
      requiredHours,
      availableHours,
      conflictIds: [...ids].sort(),
      issues,
      allocations: [],
      evidence: working
        .slice()
        .sort((a, b) => a.commitment.id.localeCompare(b.commitment.id))
        .map((w) => failureEvidence(workspace, w, editors, elig)),
      assumptions,
    };
  }

  // Specific commitments could not be placed (single blocker or pinned failure).
  const placedIds = new Set(result.deepestAllocations.map((a) => a.commitmentId));
  const unplaced = working.filter((w) => !placedIds.has(w.commitment.id));
  const issues: string[] = [];
  const conflictIds: string[] = [];
  for (const w of unplaced) {
    conflictIds.push(w.commitment.id);
    if (w.pinnedEditorId) {
      const blocked = elig.blocked.get(w.campaign.id)?.get(w.pinnedEditorId);
      if (blocked) {
        issues.push(
          `"${w.commitment.title}" (${w.commitment.id}) cannot be pinned to ${w.pinnedEditorId}: ` +
          `approval ${blocked.id} records them as not approved for ${w.campaign.name}.`,
        );
        conflictIds.push(blocked.id);
        continue;
      }
      if (!elig.approved.get(w.campaign.id)?.has(w.pinnedEditorId)) {
        issues.push(
          `"${w.commitment.title}" (${w.commitment.id}) cannot be pinned to ${w.pinnedEditorId}: ` +
          `no approval fact exists for that editor on ${w.campaign.name}; PACT treats this as unknown ` +
          `and will not schedule them.`,
        );
        continue;
      }
    }
    const freeLines = editors
      .filter((e) => elig.approved.get(w.campaign.id)?.has(e.id))
      .map((e) => {
        const total = editorSlots(e).filter((s) => {
          const day = dayOfSlot(s);
          return day >= w.releaseDay && day <= w.deadline;
        }).length;
        const reservedByOthers = result.deepestAllocations
          .filter((a) => a.editorId === e.id)
          .reduce((n, a) => n + a.slots.filter((s) => {
            const day = dayOfSlot(s);
            return day >= w.releaseDay && day <= w.deadline;
          }).length, 0);
        return `${e.name} has ${Math.max(0, total - reservedByOthers)} of ${total}h still free in Day ${w.releaseDay}..${w.deadline}`;
      })
      .sort();
    issues.push(
      `"${w.commitment.title}" (${w.commitment.id}) needs ${w.hours}h inside Day ${w.releaseDay}..${w.deadline} ` +
      `and cannot be placed: ${freeLines.length ? freeLines.join('; ') : 'no approved editors'}. ` +
      blockedCandidateLines(workspace, [w], elig).join(' '),
    );
  }
  const unplacedTitles = unplaced.map((w) => `"${w.commitment.title}"`).sort();
  const summary =
    `Infeasible: ${unplacedTitles.length > 0 ? unplacedTitles.join(', ') : 'the plan'} cannot be placed ` +
    `(${requiredHours}h due; union of approved editor-hours in the relevant windows is ${availableHours}h).`;
  return {
    status: 'infeasible',
    summary,
    requiredHours,
    availableHours,
    conflictIds: [...new Set(conflictIds)].sort(),
    issues,
    allocations: [],
    evidence: unplaced.map((w) => failureEvidence(workspace, w, editors, elig)),
    assumptions,
  };
}

/** Stable 8-hex FNV-1a digest so proposal ids are deterministic across runs. */
export function stableId(...parts: string[]): string {
  const input = parts.join('\u0000');
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, '0');
}

/** Deterministic timestamp anchor: the most recently updated source. */
export function anchorTime(workspace: Workspace): string {
  return workspace.sources.reduce((latest, s) => (s.updatedAt > latest ? s.updatedAt : latest), '1970-01-01T00:00:00.000Z');
}

function sourceVersionsOf(workspace: Workspace): Record<string, number> {
  const versions: Record<string, number> = {};
  for (const source of [...workspace.sources].sort((a, b) => a.id.localeCompare(b.id))) {
    versions[source.id] = source.revision;
  }
  return versions;
}

/**
 * Deterministic repair proposals for the current snapshot. Never mutates the
 * input workspace. Emits:
 *  - "move" proposals (status proposed) when flexing a deadline to its
 *    flexUntilDay makes the whole plan feasible;
 *  - "rejected" backup-editor candidates that are explicitly blocked by an
 *    approval fact (never silently usable);
 *  - "info" proposals when durations are unknown.
 */
export function proposeRepairs(workspace: Workspace): Proposal[] {
  const base = checkPlan(workspace);
  if (base.status === 'feasible') return [];
  const createdAt = anchorTime(workspace);
  const sourceVersions = sourceVersionsOf(workspace);
  const campaigns = new Map(workspace.campaigns.map((c) => [c.id, c]));
  const proposals: Proposal[] = [];

  if (base.status === 'needs_information') {
    for (const commitmentId of base.conflictIds) {
      const commitment = workspace.commitments.find((c) => c.id === commitmentId);
      if (!commitment) continue;
      const campaign = campaigns.get(commitment.campaignId);
      proposals.push({
        id: `pr-${stableId('info', commitmentId)}`,
        title: `Confirm edit hours for ${campaign?.name ?? commitment.campaignId}`,
        description:
          `The brief does not state how many editor-hours "${commitment.title}" needs. ` +
          `Ask the account manager to confirm the duration before scheduling; PACT will not guess.`,
        revision: workspace.revision,
        changes: [],
        result: base,
        status: 'proposed',
        createdAt,
        sourceVersions,
      });
    }
    return proposals;
  }

  // Infeasible (or search_limit): try deadline moves allowed by flexUntilDay.
  const flexables = workspace.commitments
    .filter((c) => c.flexUntilDay > c.deadlineDay)
    .sort((a, b) => a.id.localeCompare(b.id));
  const movesTried = new Set<string>();
  const tryMove = (changes: PlanChange[], flexed: Commitment[]): Proposal | null => {
    const key = changes.map((c) => `${c.commitmentId}:${c.deadlineDay}`).join('|');
    if (movesTried.has(key)) return null;
    movesTried.add(key);
    const result = checkPlan(workspace, changes);
    if (result.status !== 'feasible') return null;
    const names = flexed.map((c) => `"${c.title}"`).join(', ');
    return {
      id: `pr-${stableId('move', key)}`,
      title:
        flexed.length === 1
          ? `Move ${names} to Day ${flexed[0]!.flexUntilDay}`
          : `Flex ${names} to their later limits`,
      description:
        `${names} ${flexed.length === 1 ? 'is' : 'are'} allowed to run until Day ` +
        `${flexed.map((c) => c.flexUntilDay).join('/')} under the handoff note. Moving ` +
        `${flexed.length === 1 ? 'it' : 'them'} makes the whole plan feasible: ${result.summary}`,
      revision: workspace.revision,
      changes,
      result,
      status: 'proposed',
      createdAt,
      sourceVersions,
    };
  };
  for (const commitment of flexables) {
    const proposal = tryMove([{ commitmentId: commitment.id, deadlineDay: commitment.flexUntilDay }], [commitment]);
    if (proposal) proposals.push(proposal);
  }
  if (proposals.length === 0 && flexables.length > 1) {
    const changes: PlanChange[] = flexables.map((c) => ({ commitmentId: c.id, deadlineDay: c.flexUntilDay as Day }));
    const proposal = tryMove(changes, flexables);
    if (proposal) proposals.push(proposal);
  }

  // Rejected backup-editor candidates: explicitly blocked, never silently used.
  for (const approval of [...workspace.approvals].sort((a, b) => a.id.localeCompare(b.id))) {
    if (approval.approved) continue;
    const campaign = campaigns.get(approval.campaignId);
    const editor = workspace.editors.find((e) => e.id === approval.editorId);
    if (!campaign || !editor) continue;
    const commitmentsForCampaign = workspace.commitments
      .filter((c) => c.campaignId === campaign.id)
      .sort((a, b) => a.id.localeCompare(b.id));
    for (const commitment of commitmentsForCampaign) {
      if (commitment.hours == null) continue;
      const rawCapacity = editorSlots(editor).filter((s) => {
        const day = dayOfSlot(s);
        return day >= commitment.releaseDay && day <= commitment.deadlineDay;
      }).length;
      if (rawCapacity < commitment.hours) continue; // numerically impossible anyway
      const changes: PlanChange[] = [{ commitmentId: commitment.id, editorId: editor.id }];
      const result = checkPlan(workspace, changes);
      proposals.push({
        id: `pr-${stableId('reject', commitment.id, editor.id)}`,
        title: `Rejected: ${editor.name} for ${campaign.name}`,
        description:
          `Backup candidate considered and rejected: approval ${approval.id} from ` +
          `"${sourceTitle(workspace, approval.sourceId)}" records ${editor.name} as not approved for ` +
          `${campaign.name}, so PACT will never schedule them for it. A new approval fact would re-open this option.`,
        revision: workspace.revision,
        changes,
        result,
        status: 'rejected',
        createdAt,
        sourceVersions,
      });
    }
  }
  return proposals;
}
