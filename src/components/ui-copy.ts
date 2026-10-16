/**
 * Small-business plain-language copy helpers shared by PACT views.
 *
 * These functions only translate existing data into friendlier wording.
 * They never change a check result, invent evidence, hide a blocker or
 * promote an unknown approval to an allowed one.
 */
import type { CheckResult, Workspace } from '@/lib/types';

export const VIEW_LABELS = {
  dashboard: 'Dashboard',
  overview: 'Your work',
  conflicts: 'Needs attention',
  repairs: 'Plan options',
  receipts: 'Saved plan',
  memory: 'Ask PACT',
} as const;

export const SOURCE_KIND_LABELS: Record<string, string> = {
  brief: 'Work brief',
  policy: 'Task responsibilities',
  calendar: 'Working hours',
  handoff: 'Handoff notes',
};

export function sourceKindLabel(kind: string): string {
  return SOURCE_KIND_LABELS[kind] ?? 'Source record';
}

export function formatHours(value: number): string {
  return `${value} ${value === 1 ? 'hour' : 'hours'}`;
}

export interface AffectedWork {
  id: string;
  title: string;
  kind: 'job' | 'event' | 'campaign';
}

/**
 * Human-readable affected work, derived only from ids the checker reported.
 * Unknown ids (for example approval facts) are intentionally skipped so the
 * UI never presents a technical id as a job title.
 */
export function affectedWork(workspace: Workspace, check: CheckResult): AffectedWork[] {
  const seen = new Set<string>();
  const out: AffectedWork[] = [];
  for (const id of check.conflictIds ?? []) {
    if (seen.has(id)) continue;
    seen.add(id);
    const commitment = workspace.commitments.find((c) => c.id === id);
    if (commitment) {
      out.push({ id, title: commitment.title, kind: 'job' });
      continue;
    }
    const event = workspace.events?.find((e) => e.id === id);
    if (event) {
      out.push({ id, title: event.title, kind: 'event' });
      continue;
    }
    const campaign = workspace.campaigns.find((c) => c.id === id);
    if (campaign) {
      out.push({ id, title: campaign.name, kind: 'campaign' });
    }
  }
  return out;
}

export type CheckTone = 'good' | 'attention' | 'unknown';

export interface CheckCopy {
  tone: CheckTone;
  headline: string;
  diagnosis: string;
}

function inferCause(issues: string[]): 'approval' | 'calendar' | 'information' | 'capacity' | 'other' {
  const text = (issues ?? []).join(' ').toLowerCase();
  if (/cannot attend both|overlapping|overlap/.test(text)) return 'calendar';
  if (/joint conflict|has \d+ of \d+h still free/.test(text)) return 'capacity';
  if (/not approved|no approval|eligibility is unknown|will not schedule them/.test(text)) return 'approval';
  if (/unknown|does not state a duration|no stated edit hours/.test(text)) return 'information';
  if (/joint conflict|capacity|unschedulable|(?:editor|team)-hours|cannot be placed/.test(text)) return 'capacity';
  return 'other';
}

/**
 * One short diagnosis plus work-needed / time-available framing, derived from
 * the real CheckResult fields and status. No fixture numbers are hardcoded and
 * capacity is only named as the cause when the checker's issues actually say so.
 */
export function describeCheck(check: CheckResult): CheckCopy {
  const { status, requiredHours, availableHours, issues } = check;
  const margin = availableHours - requiredHours;

  if (status === 'feasible') {
    return {
      tone: 'good',
      headline: 'This plan fits',
      diagnosis:
        `Everything fits: ${formatHours(requiredHours)} of work within ` +
        `${formatHours(availableHours)} available before these deadlines.`,
    };
  }

  if (status === 'needs_information') {
    return {
      tone: 'unknown',
      headline: 'A few details are missing',
      diagnosis:
        'Some jobs do not have work hours yet, so PACT cannot schedule them. ' +
        'Confirm the missing hours with the owner or manager first.',
    };
  }

  if (status === 'search_limit') {
    return {
      tone: 'unknown',
      headline: 'The check was incomplete',
      diagnosis:
        'PACT reached its checking limit before it could prove this plan either way. ' +
        'Try rechecking or simplifying the plan.',
    };
  }

  // Infeasible. Lead with real numbers, then name the cause only when proven.
  const cause = inferCause(issues);
  const lead =
    margin < 0
      ? `There are ${formatHours(requiredHours)} of work and only ${formatHours(availableHours)} available before these deadlines.`
      : 'This plan cannot be scheduled as written yet.';
  const causeSentence =
    cause === 'calendar'
      ? 'Team events overlap for the same person, so move one event.'
      : cause === 'approval'
      ? 'One job still needs an eligible team member.'
      : cause === 'information'
      ? 'Confirm the missing work hours first.'
      : cause === 'capacity'
      ? margin >= 0 ? 'The available hours do not fit every job’s deadline and eligible team member. Review the working windows.' : 'Move a flexible job or add eligible help.'
      : 'Something needs to change before this plan works.';

  return {
    tone: 'attention',
    headline: 'This plan needs a change',
    diagnosis: `${lead} ${causeSentence}`,
  };
}
