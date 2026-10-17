'use client';

import { useState } from 'react';
import { ArrowUpRight, ArrowRight, Check, Clock3, FileText, Pencil, Sparkles, CircleHelp } from 'lucide-react';
import type { Analysis, Commitment, Workspace, WorkspaceEdit } from '@/lib/types';
import { dashboardState } from '@/lib/dashboard';
import { CommitmentModal } from './EditModals';
import { describeCheck } from './ui-copy';
import type { NavView } from './Nav';

interface Props {
  workspace: Workspace;
  analysis: Analysis | null;
  isChecking: boolean;
  onCheck: () => void;
  onNavigate: (view: NavView) => void;
  onEditWorkspace: (edit: WorkspaceEdit) => Promise<void>;
  onOpenSource: (sourceId?: string) => void;
}

export function DashboardView({ workspace, analysis, isChecking, onCheck, onNavigate, onEditWorkspace, onOpenSource }: Props) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editing, setEditing] = useState<Commitment | null>(null);
  const model = dashboardState(workspace, analysis);
  const check = analysis?.check;
  const selected = workspace.commitments.find(job => job.id === selectedId) ?? workspace.commitments[0];
  const campaign = workspace.campaigns.find(c => c.id === selected?.campaignId);
  const owner = workspace.people.find(p => p.id === campaign?.ownerId);
  const checked = Boolean(check);
  const saved = model.status === 'saved';
  const good = model.status === 'feasible' || saved;
  const blocked = model.status === 'infeasible';
  const uncertain = model.status === 'needs_information' || model.status === 'search_limit';
  const tone = good ? 'good' : blocked ? 'blocked' : uncertain ? 'unknown' : 'pending';
  const headline = saved ? 'A plan you can move forward with.' : model.status === 'changed' ? 'A change is ready to check.' : check ? describeCheck(check).headline : 'A little clarity for the work ahead.';
  const diagnosis = saved ? `${model.decision!.allocations.length} jobs have booked work time. Your next steps are in Saved plan.` : model.status === 'changed' ? 'Your saved bookings are still on file. Check these changes before booking a new plan.' : check ? describeCheck(check).diagnosis : 'Your jobs, your team, your deadlines. Check how they fit together before you make a promise.';
  const flowLabel = saved ? 'Booked' : good ? 'Fits, not booked' : blocked ? 'Needs a change' : uncertain ? 'Not confirmed' : 'Not checked';
  const action = saved ? () => onNavigate('receipts') : blocked ? () => onNavigate(model.readyOptions ? 'repairs' : 'conflicts') : good ? () => onNavigate('overview') : onCheck;
  const actionLabel = saved ? 'Open saved plan' : blocked ? model.readyOptions ? 'See plan options' : 'See what needs attention' : good ? 'Review your work' : 'Check this plan';

  function graph(compact: boolean) {
    const width = compact ? 360 : 900;
    const rows = compact ? Math.ceil(workspace.commitments.length / 3) : workspace.commitments.length;
    const height = compact ? 310 + (rows - 1) * 96 : Math.max(290, rows * 73 + 40);
    const hub = { x: compact ? 180 : 530, y: compact ? 170 + (rows - 1) * 96 : height / 2 - 10 };
    const finish = { x: compact ? 180 : 795, y: compact ? hub.y + 105 : hub.y };
    const stroke = good ? '#32523b' : blocked ? '#c44722' : '#96866a';
    return (
      <svg viewBox={`0 0 ${width} ${height}`} className="work-flow-svg" role="group" aria-label={`Work flow: ${flowLabel}. Select a job to see its details.`}>
        <g className="flow-connections" fill="none" strokeWidth="2">
          {workspace.commitments.map((job, i) => {
            const x = compact ? 60 + (i % 3) * 120 : 45;
            const y = compact ? 38 + Math.floor(i / 3) * 96 : 48 + i * 73;
            return <path key={job.id} stroke={stroke} opacity="0.42" strokeDasharray={checked || saved ? undefined : '4 7'} d={compact ? `M${x},${y + 17} C${x},${hub.y - 48} ${hub.x},${hub.y - 60} ${hub.x},${hub.y - 30}` : `M310,${y} C410,${y} 414,${hub.y} ${hub.x - 42},${hub.y}`} />;
          })}
          <path stroke={stroke} strokeDasharray={!checked && !saved ? '4 7' : undefined} d={compact ? `M${hub.x},${hub.y + 30} V${hub.y + 47} M${hub.x},${hub.y + (blocked ? 66 : 47)} V${finish.y - 22}` : `M${hub.x + 42},${hub.y} H${blocked ? 652 : finish.x - 26} M678,${hub.y} H${finish.x - 26}`} />
          {blocked && <path className="flow-break" stroke="#c44722" strokeWidth="3" d={compact ? `M170,${hub.y + 53} l10,-7 M180,${hub.y + 63} l10,-7` : `M658,${hub.y - 8} l-6,16 M671,${hub.y - 8} l-6,16`} />}
        </g>
        {workspace.commitments.map((job, i) => {
          const camp = workspace.campaigns.find(c => c.id === job.campaignId);
          const x = compact ? 60 + (i % 3) * 120 : 45;
          const y = compact ? 38 + Math.floor(i / 3) * 96 : 48 + i * 73;
          const involved = model.affected.has(job.id);
          const label = compact && workspace.businessType === 'creative_agency' ? camp?.brand.split(' ')[0] ?? `Job ${i + 1}` : job.title;
          return (
            <g key={job.id} role="button" tabIndex={0} aria-pressed={selected?.id === job.id} aria-label={`${job.title}, ${job.hours === null ? 'hours unknown' : `${job.hours} hours`}, Day ${job.deadlineDay}${involved ? ', shares the bottleneck' : ''}`} onClick={() => setSelectedId(job.id)} onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setSelectedId(job.id); } }} className={`flow-job ${selected?.id === job.id ? 'is-selected' : ''}`} data-testid={`flow-job-${job.id}`}>
              <rect x={compact ? x - 53 : 20} y={y - 25} width={compact ? 106 : 290} height={compact ? 83 : 59} rx="15" className="flow-job-hit" />
              <circle cx={x} cy={y} r="10" fill={job.hours === null ? '#d79c21' : involved ? '#c44722' : good ? '#32523b' : '#a9956a'} stroke="#fffaf0" strokeWidth="4" />
              <text x={compact ? x : x + 25} y={compact ? y + 30 : y - 3} textAnchor={compact ? 'middle' : 'start'} className="flow-job-name">{label.length > (compact ? 12 : 30) ? label.slice(0, compact ? 11 : 29) + '…' : label}</text>
              <text x={compact ? x : x + 25} y={compact ? y + 47 : y + 17} textAnchor={compact ? 'middle' : 'start'} className="flow-job-meta">{job.hours === null ? 'Hours unknown' : `${job.hours}h`} · Day {job.deadlineDay}</text>
            </g>
          );
        })}
        <circle cx={hub.x} cy={hub.y} r="32" fill={blocked ? '#fff0dc' : good ? '#e7efdf' : '#f5eedb'} stroke={stroke} strokeWidth="2" />
        <text x={hub.x} y={hub.y + 6} textAnchor="middle" className="flow-hub-value">{check ? `${check.availableHours}h` : saved ? `${model.decision!.allocations.reduce((sum, a) => sum + a.slots.length, 0)}h` : '?'}</text>
        <text x={compact ? hub.x + 49 : hub.x} y={compact ? hub.y - 3 : hub.y + 60} textAnchor={compact ? 'start' : 'middle'} className="flow-job-meta">{compact ? 'Work' : 'Approved work time'}</text>
        <text x={compact ? hub.x + 49 : hub.x} y={compact ? hub.y + 16 : hub.y + 79} textAnchor={compact ? 'start' : 'middle'} className="flow-job-meta">{check ? `${check.requiredHours}h ${model.unknownHours ? 'known' : 'needed'}` : saved ? 'Booked time' : 'Check to confirm'}</text>
        <circle cx={finish.x} cy={finish.y} r="21" fill={saved ? '#32523b' : '#fffbef'} stroke={saved ? '#32523b' : '#b5a386'} strokeWidth="2" strokeDasharray={saved ? undefined : '4 4'} />
        <text x={finish.x} y={finish.y + 6} textAnchor="middle" fill={saved ? '#fffaf0' : '#7a6a50'} fontSize="19">{saved ? '✓' : '○'}</text>
        <text x={finish.x} y={finish.y + 43} textAnchor="middle" className="flow-job-name">{flowLabel}</text>
      </svg>
    );
  }

  return (
    <div className={`dashboard-wrap dashboard-${tone}`} data-testid="dashboard-view">
      <section className="dashboard-welcome">
        <div><span className="editorial-label">Your business, at a glance</span><h2>Make room for<br /><em>good work.</em></h2><p>A clearer picture of what’s moving, what needs a change, and what happens next.</p></div>
        <div className="dashboard-check-in"><span className={`dashboard-state ${tone}`} data-testid="dashboard-status">{isChecking ? 'Checking your plan…' : flowLabel}</span><h3>{headline}</h3><p>{diagnosis}</p><button className="btn-editorial-primary" onClick={action} disabled={isChecking} data-testid="dashboard-next-action">{isChecking ? 'Checking…' : actionLabel}<ArrowUpRight size={17} /></button></div>
      </section>

      <div className="dashboard-stats" aria-label="Plan at a glance">
        <div><span>Jobs in your plan</span><strong>{workspace.commitments.length.toString().padStart(2, '0')}</strong><small>{workspace.campaigns.length} task briefs</small></div>
        <div><span>{model.unknownHours ? 'Known work hours' : 'Work to plan'}</span><strong>{model.knownHours}<i>h</i>{model.unknownHours ? '+' : ''}</strong><small>{model.unknownHours ? 'Some hours still need confirming' : 'Across your current jobs'}</small></div>
        <div><span>Plan options</span><strong>{model.readyOptions.toString().padStart(2, '0')}</strong><small>{saved ? 'No pending options' : checked ? 'Checked options ready to review' : 'Check your plan to find options'}</small></div>
        <div><span>Saved decisions</span><strong>{workspace.decisions.length.toString().padStart(2, '0')}</strong><small>{saved ? 'Work time booked' : workspace.decisions.length ? 'Previous bookings on file' : 'You have the final say'}</small></div>
      </div>

      <section className="dashboard-flow-card" aria-labelledby="work-flow-heading">
        <div className="dashboard-section-top"><div><span className="editorial-label">01 / The bigger picture</span><h3 id="work-flow-heading">How the work connects</h3><p>Jobs share work time. A break shows where the checked plan needs a change.</p></div><span className="flow-legend"><span className={`legend-dot ${tone}`} />{flowLabel}</span></div>
        <div className="dashboard-flow-layout"><div className="dashboard-graph"><div className="flow-desktop">{graph(false)}</div><div className="flow-mobile">{graph(true)}</div><p className="graph-hint"><CircleHelp size={14} /> Select a dot to see the job. This is a view of the plan, not a promise of delivery.</p></div>
          {selected && <aside className="dashboard-job-detail" aria-live="polite" data-testid="dashboard-job-detail"><span className="editorial-label">A closer look</span><h4>{selected.title}</h4><p>{campaign?.name}</p><dl><div><dt>Work</dt><dd>{selected.hours === null ? 'Hours not known yet' : `${selected.hours} hours`}</dd></div><div><dt>Due</dt><dd>Day {selected.deadlineDay}</dd></div><div><dt>Owner</dt><dd>{owner?.name ?? 'Not assigned'}</dd></div><div><dt>In this plan</dt><dd>{selected.hours === null ? 'Needs a duration' : model.affected.has(selected.id) ? 'Shares the bottleneck' : good ? saved ? 'Work time booked' : 'Fits, not booked' : 'Check to confirm'}</dd></div></dl><button className="btn-editorial-secondary" onClick={() => setEditing(selected)} data-testid="dashboard-edit-job"><Pencil size={14} /> Edit this job</button>{campaign?.sourceId && <button className="dashboard-source-link" onClick={() => onOpenSource(campaign.sourceId)}><FileText size={14} /> Read the brief<ArrowUpRight size={13} /></button>}</aside>}
        </div>
      </section>

      <section aria-labelledby="dashboard-sections-heading" className="dashboard-sections"><div className="dashboard-section-top"><div><span className="editorial-label">02 / A place for everything</span><h3 id="dashboard-sections-heading">One step at a time</h3></div><span className="dashboard-small-note">Clear choices. You stay in charge.</span></div><div className="dashboard-shortcuts">
        {([
          { view: 'overview', icon: Pencil, title: 'Work by work', text: 'Adjust each job, working hours and task responsibilities.', meta: `${workspace.commitments.length} jobs` },
          { view: saved ? 'receipts' : 'conflicts', icon: Clock3, title: 'Needs attention', text: saved ? 'Your approved plan is saved. See its bookings and next steps.' : checked ? 'See the check and the reasons behind it.' : 'Check your plan to see what needs a closer look.', meta: saved ? 'Approved plan saved' : model.status === 'changed' ? 'Changes need checking' : checked ? flowLabel : 'Not checked yet' },
          { view: 'repairs', icon: Sparkles, title: 'Plan options', text: 'Compare changes and choose what works for you.', meta: `${model.readyOptions} ready to review` },
          { view: 'receipts', icon: Check, title: 'Saved plan', text: 'Find booked work time and the next steps you approved.', meta: `${workspace.decisions.length} saved decisions` },
        ] as const).map(({ view, icon: Icon, title, text, meta }) => <button key={view} onClick={() => onNavigate(view)} className="dashboard-shortcut"><span className="shortcut-icon"><Icon size={19} /></span><span><strong>{title}</strong><small>{text}</small><em>{meta}</em></span><ArrowRight size={19} /></button>)}
      </div></section>
      <p className="dashboard-sample-note" data-testid="page-intro">{workspace.agency} · {workspace.kind === 'custom' ? 'Your confirmed business setup' : 'Fictional sample workspace'} · Nothing is booked without your approval.</p>
      {editing && <CommitmentModal key={editing.id} commitment={editing} onClose={() => setEditing(null)} onSave={onEditWorkspace} />}
    </div>
  );
}
