'use client';

import { Workspace, Analysis } from '@/lib/types';
import { ArrowRight, FileText, CheckCircle2, AlertCircle, HelpCircle, Play } from 'lucide-react';
import { describeCheck } from './ui-copy';

interface Props {
  workspace: Workspace | null;
  analysis: Analysis | null;
  onNavigateToConflicts: () => void;
  onNavigateToRepairs: () => void;
  onOpenSourceDrawer: (sourceId?: string) => void;
  onCheckPlan?: () => void;
  isChecking?: boolean;
}

export function HeroBottleneckCard({
  workspace,
  analysis,
  onNavigateToConflicts,
  onNavigateToRepairs,
  onOpenSourceDrawer,
  onCheckPlan,
  isChecking,
}: Props) {
  if (!workspace) return null;
  const check = analysis?.check;
  const feasible = check?.status === 'feasible';
  const blocked = check?.status === 'infeasible';
  const sourceId = check?.evidence.flatMap(path => path.sourceIds).find(id => workspace.sources.some(source => source.id === id));
  const labels = {
    feasible: 'Fits the recorded constraints',
    infeasible: 'Plan needs a change',
    needs_information: 'More information needed',
    search_limit: 'Check incomplete',
  };
  const copy = check ? describeCheck(check) : null;
  const title = copy ? copy.headline : null;

  return (
    <section
      className="paper-card"
      data-testid="hero-card"
      aria-labelledby="plan-headline"
      style={{
        padding: '22px 24px',
        marginBottom: '20px',
        borderLeft: `4px solid ${feasible ? 'var(--sage-600)' : blocked ? 'var(--clay-600)' : 'var(--paper-border-strong)'}`,
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px', marginBottom: '14px' }}>
        <span className={`badge-status ${feasible ? 'feasible' : blocked ? 'infeasible' : 'neutral'}`}>
          {feasible ? <CheckCircle2 size={14} /> : blocked ? <AlertCircle size={14} /> : <HelpCircle size={14} />}
          {check ? labels[check.status] : 'Ready to check'}
        </span>
        <span className="editorial-label">Morrow Studio · fictional agency</span>
      </div>

      <h2 id="plan-headline" className="editorial-headline" style={{ fontSize: 'clamp(1.45rem, 2.6vw, 2rem)', lineHeight: 1.2 }}>
        {title ? (
          title
        ) : (
          <>
            Can we keep these promises, <em style={{ fontStyle: 'italic', fontWeight: 400 }}>before we commit</em>?
          </>
        )}
      </h2>

      <p className="pact-summary" data-testid="hero-summary" style={{ maxWidth: '780px', marginTop: '10px', marginBottom: '18px', color: 'var(--ink-secondary)', lineHeight: 1.55 }}>
        {copy?.diagnosis ?? 'Three campaigns share the same studio time. Check the whole plan against briefs, working hours, and client approvals before you commit.'}
      </p>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 200px), 1fr))', gap: '12px' }}>
        {workspace.campaigns.map(campaign => {
          const creator = workspace.creators.find(person => person.id === campaign.creatorId);
          const commitments = workspace.commitments.filter(item => item.campaignId === campaign.id);
          return (
            <article key={campaign.id} style={{ borderTop: `3px solid ${campaign.color}`, paddingTop: '10px' }}>
              <span className="editorial-label" style={{ fontSize: '0.72rem' }}>{campaign.brand}</span>
              <h3 style={{ margin: '4px 0 6px 0', fontWeight: 600, fontSize: '0.94rem' }}>{campaign.name}</h3>
              <p style={{ color: 'var(--ink-secondary)', fontSize: '0.82rem', marginBottom: '8px' }}>{creator?.name ?? 'Creator not recorded'} {creator?.handle}</p>
              {commitments.map(commitment => (
                <div key={commitment.id} style={{ display: 'flex', justifyContent: 'space-between', gap: '8px', fontSize: '0.82rem', paddingBottom: '4px' }}>
                  <span>{commitment.hours === null ? 'Duration unknown' : `${commitment.hours} hours of editing`}</span>
                  <strong>Day {commitment.deadlineDay}</strong>
                </div>
              ))}
            </article>
          );
        })}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '14px', marginTop: '18px', paddingTop: '14px', borderTop: '1px solid var(--paper-border)' }}>
        <button type="button" onClick={() => onOpenSourceDrawer(sourceId)} className="btn-editorial-secondary" data-testid="hero-open-sources">
          <FileText size={14} /> Read the sources
        </button>
        {check ? (
          <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
            <button type="button" onClick={onNavigateToConflicts} className="btn-editorial-secondary" data-testid="hero-see-attention">
              What needs attention
            </button>
            <button type="button" onClick={onNavigateToRepairs} className="btn-editorial-primary pact-primary-action" data-testid="hero-see-options">
              See plan options <ArrowRight size={14} />
            </button>
          </div>
        ) : (
          onCheckPlan && (
            <button
              type="button"
              onClick={onCheckPlan}
              disabled={isChecking}
              className="btn-editorial-primary pact-primary-action"
              data-testid="hero-check-plan"
            >
              <Play size={13} /> {isChecking ? 'Checking plan…' : 'Check this plan'}
            </button>
          )
        )}
      </div>
    </section>
  );
}
