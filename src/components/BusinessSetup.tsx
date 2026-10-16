'use client';

import { useEffect, useRef, useState } from 'react';
import { ArrowRight, Plus, Sparkles, Trash2 } from 'lucide-react';
import { burgerExample, BURGER_DEMO_NOTE, emptySetup, missingSetupFields, setupDraftSchema, SETUP_DEMO_NOTE, type SetupDraft } from '@/lib/business-setup';
import type { Workspace } from '@/lib/types';

const STORAGE_KEY = 'pact-business-setup-draft-v1';
const exampleDraft = (): SetupDraft => ({
  businessType: 'creative_agency', companyName: 'Sunroom Studio', ownerName: 'Asha', suggestions: [],
  editors: [
    { name: 'Neha', slots: Array.from({ length: 16 }, (_, i) => i), evidence: 'Neha edits 9–5 on Day 1 and Day 2.' },
    { name: 'Rohan', slots: [0, 1, 2, 3], evidence: 'Rohan can edit 9–1 on Day 1.' },
  ],
  jobs: ['Aurora skincare launch edit', 'Beacon fitness edit', 'Comet coffee edit'].map((title, i) => ({ client: ['Aurora', 'Beacon', 'Comet'][i], title, hours: 4, deadlineDay: 1, flexUntilDay: i === 2 ? 2 : 1, evidence: i === 2 ? 'Comet may finish on Day 2.' : 'Aurora and Beacon cannot move.' })),
  permissions: [0, 1, 2].map(jobIndex => ({ editorIndex: 0, jobIndex, state: 'approved', evidence: 'Neha is approved for all three clients.' })),
});

function Evidence({ quote }: { quote: string }) {
  return quote ? <details className="setup-evidence"><summary>See the original sentence</summary><blockquote>{quote}</blockquote><p>Check that this sentence supports these fields. Your edits are recorded as user-confirmed inputs.</p></details> : <p className="setup-hint">Suggested or manually entered inputs. Not independently verified; review before accepting.</p>;
}

export function BusinessSetup({ onCreated, onSample, aiAvailable }: { onCreated: (workspace: Workspace) => void; onSample: () => Promise<void>; aiAvailable: boolean }) {
  const [note, setNote] = useState('');
  const [draft, setDraft] = useState<SetupDraft | null>(null);
  const [mode, setMode] = useState<'manual' | 'example' | 'live'>('manual');
  const [busy, setBusy] = useState<'generate' | 'create' | 'sample' | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [acceptedSuggestions, setAcceptedSuggestions] = useState(false);
  const [error, setError] = useState('');
  const [loaded, setLoaded] = useState(false);
  const setupKey = useRef<string | null>(null);

  useEffect(() => {
    try {
      const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
      if (raw && typeof raw.note === 'string' && raw.note.length <= 4000) {
        setNote(raw.note);
        const parsed = setupDraftSchema.safeParse(raw.draft ? { businessType: 'creative_agency', suggestions: [], ...raw.draft } : null);
        if (parsed.success) setDraft(parsed.data);
        if (raw.mode === 'example' || raw.mode === 'live') setMode(raw.mode);
      }
    } catch { /* An unavailable browser store must not block setup. */ }
    setLoaded(true);
  }, []);
  useEffect(() => {
    if (!loaded) return;
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify({ note, draft, mode })); } catch { /* The in-page draft remains usable. */ }
  }, [loaded, note, draft, mode]);

  function change(next: SetupDraft) { setDraft(next); setConfirmed(false); setAcceptedSuggestions(false); setupKey.current = null; }
  async function generate() {
    setBusy('generate'); setError('');
    try {
      const response = await fetch('/api/setup-draft', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ note }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'AI setup failed. Your note is still here; you can fill the form manually.');
      change(setupDraftSchema.parse(data.draft)); setMode('live');
    } catch (err) { setError(err instanceof Error ? err.message : 'Could not draft your setup.'); }
    finally { setBusy(null); }
  }
  async function create() {
    if (!draft || !confirmed || busy || (draft.suggestions.length > 0 && !acceptedSuggestions)) return;
    setBusy('create'); setError('');
    setupKey.current ??= crypto.randomUUID();
    try {
      const response = await fetch('/api/setup', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ draft, note, confirmation: true, assumptionsAccepted: acceptedSuggestions, idempotencyKey: setupKey.current }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Could not create the workspace. Your draft is still here.');
      try { localStorage.removeItem(STORAGE_KEY); } catch { /* Saving the workspace does not depend on browser storage. */ }
      onCreated(data.workspace);
    } catch (err) { setError(err instanceof Error ? err.message : 'Could not save your workspace.'); }
    finally { setBusy(null); }
  }
  const missing = draft ? missingSetupFields(draft) : [];
  const unknownPermissions = draft ? draft.editors.length * draft.jobs.length - draft.permissions.filter(p => p.state !== 'unknown').length : 0;
  const updateEditor = (index: number, patch: Partial<SetupDraft['editors'][number]>) => draft && change({ ...draft, editors: draft.editors.map((e, i) => i === index ? { ...e, ...patch } : e) });
  const updateJob = (index: number, patch: Partial<SetupDraft['jobs'][number]>) => draft && change({ ...draft, jobs: draft.jobs.map((j, i) => i === index ? { ...j, ...patch } : j) });

  return <section className="setup-shell" data-testid="business-setup">
    <div className="setup-heading"><span className="editorial-label">PACT / Business setup</span><h1>Your business.<br /><em>A little more organised.</em></h1><p>Describe your team and the work ahead. Review the details, then build a planning desk that belongs to you.</p><p className="setup-hint">For small businesses · Up to 6 tasks and 4 team members · Two-day planning window, 09:00–17:00</p></div>
    {error && !draft && <div className="setup-error" role="alert">{error}</div>}
    {!draft ? <div className="setup-panel">
      <label htmlFor="business-note">Tell PACT about your business</label><p className="setup-hint">A sentence is enough: say what your business does. AI will propose a team, tasks and starting hours for you to review. Add real details if you have them.</p>
      <textarea id="business-note" data-testid="business-note" value={note} onChange={e => setNote(e.target.value)} maxLength={4000} rows={8} placeholder="I run a small burger shop in Pune. Set up my team and the work for the next two days." />
      <div className="setup-prompt-examples"><button disabled={!!busy} onClick={() => setNote('I run a small burger shop in Pune. Set up my team and the work for the next two days.')}>Use a burger-shop prompt</button><button disabled={!!busy} onClick={() => setNote('I run a small creative agency. Set up my team, client work and next two days.')}>Use an agency prompt</button></div>
      <p className="setup-hint">AI reads this note only when you choose Draft my setup. This draft stays in this browser until you clear it or create your workspace.</p>
      <div className="setup-actions"><button className="btn-editorial-primary" onClick={generate} disabled={!aiAvailable || !note.trim() || !!busy} data-testid="generate-setup"><Sparkles size={16} />{busy === 'generate' ? 'Drafting your setup…' : 'Draft my setup with AI'}</button><button className="btn-editorial-secondary" disabled={!!busy} onClick={() => { change(emptySetup()); setMode('manual'); setError(''); }} data-testid="manual-setup">Fill it in myself</button></div>
      {!aiAvailable && <p className="setup-hint">AI setup needs a server-side provider key and the shared budget store. Manual setup and the labelled example work without them.</p>}
      <div className="setup-secondary-actions"><button disabled={!!busy} onClick={() => { setNote(SETUP_DEMO_NOTE); change(exampleDraft()); setMode('example'); setError(''); }} data-testid="example-setup">Agency example (no AI call)</button><button disabled={!!busy} onClick={() => { setNote(BURGER_DEMO_NOTE); change(burgerExample()); setMode('example'); setError(''); }} data-testid="burger-example">Burger-shop example (no AI call)</button><button disabled={!!busy} onClick={async () => { setBusy('sample'); try { await onSample(); } finally { setBusy(null); } }}>Try the original sample workspace</button><button onClick={() => { setNote(''); setError(''); }} disabled={!!busy || !note}>Clear my note</button></div>
    </div> : <>
      <div className="setup-panel setup-review-intro"><div><span className="editorial-label">Review before creating</span><h2>Make this yours.</h2><p>{mode === 'live' ? 'AI drafted a starting workspace. Quoted facts come from your note; suggested defaults are planning assumptions for you to review.' : mode === 'example' ? 'This is a hand-authored example draft, not an AI result. Change it to explore the real setup flow.' : 'Your manual setup. Unknown facts stay unknown.'}</p></div><button className="btn-editorial-secondary" disabled={!!busy} onClick={() => { setDraft(null); setConfirmed(false); }}>Back to description</button></div>
      <fieldset disabled={!!busy} className="setup-fields">
        <section className="setup-panel"><label>Business type<select value={draft.businessType} data-testid="setup-business-type" onChange={e => change({ ...draft, businessType: e.target.value as SetupDraft['businessType'] })}><option value="food_shop">Burger / food shop</option><option value="creative_agency">Creative agency</option><option value="other">Other small business</option></select></label><p className="setup-hint">The same staff-time planner supports your own tasks and responsibility rules. This version does not manage tills, stock quantities or live customer orders.</p></section>
        {draft.suggestions.length > 0 && <section className="setup-panel setup-assumptions" data-testid="setup-assumptions"><h2>Suggested defaults — please review</h2><p>These are proposed starting points, not facts about your business.</p><ul>{draft.suggestions.map((suggestion, i) => <li key={i}>{suggestion}</li>)}</ul><label className="setup-checkbox"><input type="checkbox" checked={acceptedSuggestions} onChange={e => setAcceptedSuggestions(e.target.checked)} data-testid="accept-suggestions" />I reviewed and accept these planning assumptions, including any proposed time estimates and responsibility rules.</label></section>}
        <div className="setup-panel setup-grid"><label>Business name<input value={draft.companyName} maxLength={100} onChange={e => change({ ...draft, companyName: e.target.value })} data-testid="setup-company" /></label><label>Who owns the next steps?<input value={draft.ownerName} maxLength={100} onChange={e => change({ ...draft, ownerName: e.target.value })} data-testid="setup-owner" /></label></div>
        <section className="setup-panel"><h2>01 / Your team</h2><p className="setup-hint">Each square is one hour. Select working hours for two planning days; these are availability, not bookings.</p>
          {draft.editors.map((editor, index) => <article className="setup-record" key={index}><div className="setup-record-heading"><label>Team member or role {index + 1}<input value={editor.name} maxLength={100} onChange={e => updateEditor(index, { name: e.target.value })} data-testid={`setup-editor-${index}`} /></label>{draft.editors.length > 1 && <button aria-label={`Remove team member ${index + 1}`} onClick={() => change({ ...draft, editors: draft.editors.filter((_, i) => i !== index), permissions: draft.permissions.filter(p => p.editorIndex !== index).map(p => ({ ...p, editorIndex: p.editorIndex > index ? p.editorIndex - 1 : p.editorIndex })) })}><Trash2 size={16} /></button>}</div>
            <label className="setup-checkbox"><input type="checkbox" checked={editor.slots !== null} onChange={e => updateEditor(index, { slots: e.target.checked ? [] : null })} />Working hours confirmed (zero hours is allowed)</label>
            {[0, 1].map(day => <div key={day} className="setup-hours"><span>Day {day + 1}</span><div>{Array.from({ length: 8 }, (_, hour) => { const slot = day * 8 + hour; const selected = editor.slots?.includes(slot) ?? false; return <button key={slot} disabled={editor.slots === null} aria-label={`${editor.name || `Team member ${index + 1}`} Day ${day + 1}, ${hour + 9}:00 to ${hour + 10}:00`} aria-pressed={selected} onClick={() => updateEditor(index, { slots: selected ? editor.slots!.filter(s => s !== slot) : [...editor.slots!, slot] })}>{hour + 9}</button>; })}</div></div>)}<Evidence quote={editor.evidence} /></article>)}
          {draft.editors.length < 4 && <button className="btn-editorial-secondary" onClick={() => change({ ...draft, editors: [...draft.editors, { name: '', slots: null, evidence: '' }] })}><Plus size={15} />Add a team member</button>}
        </section>
        <section className="setup-panel"><h2>02 / The work ahead</h2>{draft.jobs.map((job, index) => <article className="setup-record" key={index}><div className="setup-record-heading"><h3>Job {index + 1}</h3>{draft.jobs.length > 1 && <button aria-label={`Remove job ${index + 1}`} onClick={() => change({ ...draft, jobs: draft.jobs.filter((_, i) => i !== index), permissions: draft.permissions.filter(p => p.jobIndex !== index).map(p => ({ ...p, jobIndex: p.jobIndex > index ? p.jobIndex - 1 : p.jobIndex })) })}><Trash2 size={16} /></button>}</div><div className="setup-grid"><label>Client, department or work area<input value={job.client} maxLength={100} onChange={e => updateJob(index, { client: e.target.value })} /></label><label>Job title<input value={job.title} maxLength={100} onChange={e => updateJob(index, { title: e.target.value })} data-testid={`setup-job-${index}`} /></label><label>Work hours (blank = unknown)<input type="number" min={1} max={8} step={1} value={job.hours ?? ''} onChange={e => updateJob(index, { hours: e.target.value === '' ? null : Number(e.target.value) })} /></label><label>Due<select value={job.deadlineDay ?? ''} onChange={e => updateJob(index, { deadlineDay: e.target.value ? Number(e.target.value) as 1 | 2 : null })}><option value="">Please confirm</option><option value="1">Day 1</option><option value="2">Day 2</option></select></label><label>Latest permitted day<select value={job.flexUntilDay ?? ''} onChange={e => updateJob(index, { flexUntilDay: e.target.value ? Number(e.target.value) as 1 | 2 : null })}><option value="">Please confirm</option><option value="1">Day 1 — fixed</option><option value="2">Day 2</option></select></label></div><Evidence quote={job.evidence} /></article>)}{draft.jobs.length < 6 && <button className="btn-editorial-secondary" onClick={() => change({ ...draft, jobs: [...draft.jobs, { client: '', title: '', hours: null, deadlineDay: null, flexUntilDay: null, evidence: '' }] })}><Plus size={15} />Add a job</button>}</section>
        <section className="setup-panel"><h2>03 / Who can handle each task?</h2><p>Record who is assigned and allowed to do each task. Responsibility suggestions are not verified qualifications. Unknown means PACT cannot use that person for this task.</p>{unknownPermissions > 0 && <p className="setup-hint" data-testid="setup-unknown-permissions">{unknownPermissions} permissions still unknown. You can confirm them here or keep them unknown.</p>}{draft.jobs.map((job, jobIndex) => <div className="setup-record" key={jobIndex}><h3>{job.client || `Job ${jobIndex + 1}`} / {job.title}</h3>{draft.editors.map((editor, editorIndex) => { const permission = draft.permissions.find(p => p.editorIndex === editorIndex && p.jobIndex === jobIndex); return <div key={editorIndex}><label className="setup-permission">{editor.name || `Team member ${editorIndex + 1}`}<select value={permission?.state ?? 'unknown'} data-testid={`setup-permission-${editorIndex}-${jobIndex}`} onChange={e => change({ ...draft, permissions: [...draft.permissions.filter(p => p !== permission), { editorIndex, jobIndex, state: e.target.value as 'approved' | 'denied' | 'unknown', evidence: '' }] })}><option value="unknown">Not confirmed</option><option value="approved">Allowed / assigned</option><option value="denied">Not allowed / not assigned</option></select></label>{permission?.evidence && <Evidence quote={permission.evidence} />}</div>; })}</div>)}</section>
      </fieldset>
      <details className="setup-panel"><summary>Your original note</summary><p className="setup-original-note">{note || 'No note: fields entered manually.'}</p></details>
      <div className="setup-panel"><h2>Ready when you are.</h2>{error && <div className="setup-error" role="alert">{error}</div>}{missing.length > 0 && <div role="status"><p>Before creating, please confirm:</p><ul>{missing.map(field => <li key={field}>{field}</li>)}</ul></div>}<label className="setup-checkbox"><input type="checkbox" checked={confirmed} disabled={!!busy} onChange={e => setConfirmed(e.target.checked)} data-testid="confirm-setup" />I reviewed the inputs and responsibility rules. Create my workspace; do not book work yet.</label><button className="btn-editorial-primary" disabled={!!busy || !confirmed || missing.length > 0 || (draft.suggestions.length > 0 && !acceptedSuggestions)} onClick={create} data-testid="create-business">{busy === 'create' ? 'Creating your workspace…' : 'Create my workspace'}<ArrowRight size={16} /></button></div>
    </>}
  </section>;
}
