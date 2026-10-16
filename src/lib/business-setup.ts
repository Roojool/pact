import { z } from 'zod';
import type { Workspace } from './types';
import { PactError } from './validation';

const name = z.string().trim().max(100);
const quote = z.string().max(240);
const day = z.union([z.literal(1), z.literal(2)]).nullable();
export const setupDraftSchema = z.object({
  businessType: z.enum(['creative_agency', 'food_shop', 'other']),
  companyName: name,
  ownerName: name,
  suggestions: z.array(z.string().trim().min(1).max(240)).max(12),
  editors: z.array(z.object({ name, slots: z.array(z.number().int().min(0).max(15)).max(16).nullable(), evidence: quote }).strict()).min(1).max(4),
  jobs: z.array(z.object({ client: name, title: name, hours: z.number().int().min(1).max(8).nullable(), deadlineDay: day, flexUntilDay: day, evidence: quote }).strict()).min(1).max(6),
  permissions: z.array(z.object({ editorIndex: z.number().int().min(0).max(3), jobIndex: z.number().int().min(0).max(5), state: z.enum(['approved', 'denied', 'unknown']), evidence: quote }).strict()).max(24),
}).strict();
export type SetupDraft = z.infer<typeof setupDraftSchema>;

export function emptySetup(): SetupDraft {
  return { businessType: 'other', companyName: '', ownerName: '', suggestions: [], editors: [{ name: '', slots: null, evidence: '' }], jobs: [{ client: '', title: '', hours: null, deadlineDay: null, flexUntilDay: null, evidence: '' }], permissions: [] };
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
    if (!editor.name.trim()) missing.push(`Team member ${i + 1}: name or role`);
    if (editor.slots === null) missing.push(`Team member ${i + 1}: confirm working hours (including none)`);
  });
  draft.jobs.forEach((job, i) => {
    if (!job.title.trim() || !job.client.trim()) missing.push(`Job ${i + 1}: title and client, department or work area`);
    if (job.hours !== null && (!Number.isInteger(job.hours) || job.hours < 1 || job.hours > 8)) missing.push(`Job ${i + 1}: whole work hours between 1 and 8, or unknown`);
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
  const sources: Workspace['sources'] = [{ id: 'src-setup', title: 'Business setup — original note and accepted assumptions', kind: 'handoff', revision: 1, excerpt: `${source || 'Workspace entered manually.'}\n\nUser accepted these planning suggestions: ${draft.suggestions.length ? draft.suggestions.join('; ') : 'None recorded.'}`, updatedAt: now }];
  const addSource = (key: string, title: string, kind: Workspace['sources'][number]['kind'], evidence: string, value: unknown) => {
    sources.push({ id: key, title, kind, revision: 1, excerpt: `${evidence ? `Original note: ${evidence}\n\n` : 'Manually entered or suggested planning inputs, accepted by the user.\n\n'}Inputs confirmed by the user (may include estimates): ${JSON.stringify(value)}`, updatedAt: now });
    return key;
  };
  const editors = draft.editors.map((editor, i) => ({ id: `ed-${i + 1}`, name: editor.name, initials: initials(editor.name), slots: [...editor.slots!].sort((a, b) => a - b), sourceId: addSource(`src-calendar-${i + 1}`, `${editor.name} — confirmed working hours`, 'calendar', editor.evidence, { slots: editor.slots }) }));
  const campaigns = draft.jobs.map((job, i) => ({ id: `cp-${i + 1}`, name: job.title, brand: job.client, creatorId: '', ownerId: 'owner-1', sourceId: addSource(`src-brief-${i + 1}`, `${job.client} — ${job.title}`, 'brief', job.evidence, job), category: draft.businessType === 'food_shop' ? 'Shop operations' : draft.businessType === 'creative_agency' ? 'Client work' : 'Business operations', color: ['#c96832', '#68734c', '#c89331'][i % 3] }));
  const commitments = draft.jobs.map((job, i) => ({ id: `cm-${i + 1}`, campaignId: campaigns[i].id, title: job.title, hours: job.hours, releaseDay: 1 as const, deadlineDay: job.deadlineDay!, flexUntilDay: job.flexUntilDay!, status: 'committed' as const }));
  const approvals: Workspace['approvals'] = draft.permissions.filter(p => p.state !== 'unknown').map((p, i) => ({ id: `ap-${i + 1}`, campaignId: campaigns[p.jobIndex].id, editorId: editors[p.editorIndex].id, approved: p.state === 'approved', sourceId: addSource(`src-policy-${i + 1}`, `${editors[p.editorIndex].name} × ${campaigns[p.jobIndex].brand} — task responsibility`, 'policy', p.evidence, p) }));
  return { id, agency: draft.companyName, kind: 'custom', businessType: draft.businessType, revision: 1, creators: [], people: [{ id: 'owner-1', name: draft.ownerName, role: 'Business owner / manager' }], sources, campaigns, commitments, editors, approvals, events: [], proposals: [], decisions: [], activity: [{ id: 'act-1', role: 'system', text: 'Business setup and any suggested inputs reviewed and accepted. No work has been booked.', sourceIds: ['src-setup'], createdAt: now }] };
}

export const SETUP_DEMO_NOTE = 'I run Sunroom Studio in Pune. Asha manages our projects. Neha edits 9–5 on Day 1 and Day 2. Rohan can edit 9–1 on Day 1. We have three client jobs: an Aurora skincare launch edit, a Beacon fitness edit and a Comet coffee edit. Each needs four hours and is due on Day 1. Aurora and Beacon cannot move. Comet may finish on Day 2. Neha is approved for all three clients.';

export const BURGER_DEMO_NOTE = 'BunStop is a fictional burger shop in Pune. Meera manages it. Sana is the kitchen lead and works 09:00–13:00 on Day 1 and Day 2. Rohit works the counter 09:00–13:00 on Day 1. Ingredient preparation takes 2 hours, opening checks take 2 hours and team training takes 2 hours. All three are planned for Day 1. Ingredients and opening checks are fixed to Day 1; training can move to Day 2. Sana is allowed to lead all three tasks. Rohit is not assigned to these kitchen and training tasks.';

export function burgerExample(): SetupDraft {
  return { businessType: 'food_shop', companyName: 'BunStop', ownerName: 'Meera', suggestions: [],
    editors: [{ name: 'Sana — kitchen lead', slots: [0, 1, 2, 3, 8, 9, 10, 11], evidence: 'Sana is the kitchen lead and works 09:00–13:00 on Day 1 and Day 2.' }, { name: 'Rohit — counter', slots: [0, 1, 2, 3], evidence: 'Rohit works the counter 09:00–13:00 on Day 1.' }],
    jobs: ['Ingredient preparation', 'Opening checks', 'Team training'].map((title, i) => ({ client: i === 2 ? 'Team' : 'Kitchen', title, hours: 2, deadlineDay: 1, flexUntilDay: i === 2 ? 2 : 1, evidence: i === 2 ? 'training can move to Day 2.' : 'Ingredients and opening checks are fixed to Day 1;' })),
    permissions: [0, 1, 2].flatMap(jobIndex => [{ editorIndex: 0, jobIndex, state: 'approved' as const, evidence: 'Sana is allowed to lead all three tasks.' }, { editorIndex: 1, jobIndex, state: 'denied' as const, evidence: 'Rohit is not assigned to these kitchen and training tasks.' }]),
  };
}
