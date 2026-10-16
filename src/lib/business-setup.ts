import { z } from 'zod';
import type { Workspace } from './types';
import { PactError } from './validation';

const name = z.string().trim().max(100);
const quote = z.string().max(240);
const day = z.union([z.literal(1), z.literal(2)]).nullable();
export const setupDraftSchema = z.object({
  companyName: name,
  ownerName: name,
  editors: z.array(z.object({ name, slots: z.array(z.number().int().min(0).max(15)).max(16).nullable(), evidence: quote }).strict()).min(1).max(4),
  jobs: z.array(z.object({ client: name, title: name, hours: z.number().int().min(1).max(8).nullable(), deadlineDay: day, flexUntilDay: day, evidence: quote }).strict()).min(1).max(6),
  permissions: z.array(z.object({ editorIndex: z.number().int().min(0).max(3), jobIndex: z.number().int().min(0).max(5), state: z.enum(['approved', 'denied', 'unknown']), evidence: quote }).strict()).max(24),
}).strict();
export type SetupDraft = z.infer<typeof setupDraftSchema>;

export function emptySetup(): SetupDraft {
  return { companyName: '', ownerName: '', editors: [{ name: '', slots: null, evidence: '' }], jobs: [{ client: '', title: '', hours: null, deadlineDay: null, flexUntilDay: null, evidence: '' }], permissions: [] };
}

export function validateSetupDraft(raw: unknown, source: string): SetupDraft {
  const draft = setupDraftSchema.parse(raw);
  for (const record of [...draft.editors, ...draft.jobs, ...draft.permissions]) {
    if (record.evidence && !source.includes(record.evidence)) throw new PactError('A draft citation is not in your original note. Review the fields manually.', 'invalid_setup_source', 400);
  }
  const pairs = new Set<string>();
  for (const permission of draft.permissions) {
    const key = `${permission.editorIndex}:${permission.jobIndex}`;
    if (!draft.editors[permission.editorIndex] || !draft.jobs[permission.jobIndex] || pairs.has(key)) throw new PactError('Approval references must name one existing editor and job.', 'invalid_setup_permission', 400);
    pairs.add(key);
  }
  for (const editor of draft.editors) {
    if (editor.slots && new Set(editor.slots).size !== editor.slots.length) throw new PactError('Working hours cannot contain duplicate slots.', 'invalid_setup_slots', 400);
  }
  return draft;
}

export function missingSetupFields(draft: SetupDraft): string[] {
  const missing: string[] = [];
  if (!draft.companyName.trim()) missing.push('Your business name');
  if (!draft.ownerName.trim()) missing.push('The person responsible for next steps');
  draft.editors.forEach((editor, i) => {
    if (!editor.name.trim()) missing.push(`Editor ${i + 1}: name`);
    if (editor.slots === null) missing.push(`Editor ${i + 1}: confirm working hours (including none)`);
  });
  draft.jobs.forEach((job, i) => {
    if (!job.title.trim() || !job.client.trim()) missing.push(`Job ${i + 1}: title and client`);
    if (job.hours !== null && (!Number.isInteger(job.hours) || job.hours < 1 || job.hours > 8)) missing.push(`Job ${i + 1}: whole editing hours between 1 and 8, or unknown`);
    if (job.deadlineDay === null || job.flexUntilDay === null) missing.push(`Job ${i + 1}: deadline and latest permitted day`);
    else if (job.flexUntilDay < job.deadlineDay) missing.push(`Job ${i + 1}: latest permitted day cannot precede its deadline`);
  });
  return missing;
}

export function setupToWorkspace(id: string, raw: unknown, source: string): Workspace {
  const draft = validateSetupDraft(raw, source);
  const missing = missingSetupFields(draft);
  if (missing.length) throw new PactError(missing.join('; '), 'invalid_setup', 400);
  const now = new Date().toISOString();
  const initials = (value: string) => value.split(/\s+/).map(part => part[0]).join('').slice(0, 2).toUpperCase();
  const sources: Workspace['sources'] = [{ id: 'src-setup', title: 'Business setup — original note and confirmation', kind: 'handoff', revision: 1, excerpt: source || 'Workspace entered manually and confirmed by its owner.', updatedAt: now }];
  const addSource = (key: string, title: string, kind: Workspace['sources'][number]['kind'], evidence: string, value: unknown) => {
    sources.push({ id: key, title, kind, revision: 1, excerpt: `${evidence ? `Original note: ${evidence}\n\n` : ''}Fields confirmed by the user: ${JSON.stringify(value)}`, updatedAt: now });
    return key;
  };
  const editors = draft.editors.map((editor, i) => ({ id: `ed-${i + 1}`, name: editor.name, initials: initials(editor.name), slots: [...editor.slots!].sort((a, b) => a - b), sourceId: addSource(`src-calendar-${i + 1}`, `${editor.name} — confirmed working hours`, 'calendar', editor.evidence, { slots: editor.slots }) }));
  const campaigns = draft.jobs.map((job, i) => ({ id: `cp-${i + 1}`, name: job.title, brand: job.client, creatorId: '', ownerId: 'owner-1', sourceId: addSource(`src-brief-${i + 1}`, `${job.client} — ${job.title}`, 'brief', job.evidence, job), category: 'Client work', color: ['#c96832', '#68734c', '#c89331'][i % 3] }));
  const commitments = draft.jobs.map((job, i) => ({ id: `cm-${i + 1}`, campaignId: campaigns[i].id, title: job.title, hours: job.hours, releaseDay: 1 as const, deadlineDay: job.deadlineDay!, flexUntilDay: job.flexUntilDay!, status: 'committed' as const }));
  const approvals: Workspace['approvals'] = draft.permissions.filter(p => p.state !== 'unknown').map((p, i) => ({ id: `ap-${i + 1}`, campaignId: campaigns[p.jobIndex].id, editorId: editors[p.editorIndex].id, approved: p.state === 'approved', sourceId: addSource(`src-policy-${i + 1}`, `${editors[p.editorIndex].name} × ${campaigns[p.jobIndex].brand} — client permission`, 'policy', p.evidence, p) }));
  return { id, agency: draft.companyName, kind: 'custom', revision: 1, creators: [], people: [{ id: 'owner-1', name: draft.ownerName, role: 'Project owner' }], sources, campaigns, commitments, editors, approvals, events: [], proposals: [], decisions: [], activity: [{ id: 'act-1', role: 'system', text: 'Business setup reviewed and confirmed. No editing time has been booked.', sourceIds: ['src-setup'], createdAt: now }] };
}

export const SETUP_DEMO_NOTE = 'I run Sunroom Studio in Pune. Asha manages our projects. Neha edits 9–5 on Day 1 and Day 2. Rohan can edit 9–1 on Day 1. We have three client jobs: an Aurora skincare launch edit, a Beacon fitness edit and a Comet coffee edit. Each needs four hours and is due on Day 1. Aurora and Beacon cannot move. Comet may finish on Day 2. Neha is approved for all three clients.';
