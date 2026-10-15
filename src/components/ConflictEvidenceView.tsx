'use client';

import React from 'react';
import { Workspace, Analysis, CheckResult } from '@/lib/types';
import {
  AlertTriangle,
  CheckCircle2,
  HelpCircle,
  FileText,
  ArrowRight,
  GitBranch,
  Compass,
} from 'lucide-react';
import { affectedWork, describeCheck } from './ui-copy';

interface ConflictEvidenceProps {
  workspace: Workspace | null;
  analysis: Analysis | null;
  onOpenSourceDrawer: (sourceId?: string) => void;
  onNavigateToRepairs: () => void;
  onCheckPlan?: () => void;
  isChecking?: boolean;
}

function formatNodeName(id: string, workspace: Workspace): string {
  const c = workspace.commitments.find((item) => item.id === id);
  if (c) return c.title;
  const e = workspace.editors.find((item) => item.id === id);
  if (e) return e.name;
  const camp = workspace.campaigns.find((item) => item.id === id);
  if (camp) return camp.name;
  const ev = workspace.events?.find((item) => item.id === id);
  if (ev) return ev.title;
  const approval = workspace.approvals?.find((item) => item.id === id);
  if (approval) {
    const editor = workspace.editors.find((x) => x.id === approval.editorId);
    const campaign = workspace.campaigns.find((x) => x.id === approval.campaignId);
    return `Approval: ${editor?.name ?? approval.editorId} for ${campaign?.name ?? approval.campaignId}`;
  }
  return id;
}

export function ConflictEvidenceView({
  workspace,
  analysis,
  onOpenSourceDrawer,
  onNavigateToRepairs,
  onCheckPlan,
  isChecking,
}: ConflictEvidenceProps) {
  if (!workspace) return null;

  // Use ONLY analysis.check for a checked verdict — never a candidate result.
  const checkResult: CheckResult | undefined = analysis?.check;

  if (!checkResult) {
    return (
      <div className="pact-empty-state paper-card" data-testid="conflicts-empty" style={{ padding: '48px 36px', textAlign: 'center', maxWidth: '680px', margin: '40px auto' }}>
        <div
          style={{
            width: '48px',
            height: '48px',
            borderRadius: '50%',
            backgroundColor: 'var(--paper-subtle)',
            border: '1px solid var(--paper-border-strong)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            margin: '0 auto 16px auto',
            color: 'var(--ink-secondary)',
          }}
        >
          <Compass size={24} />
        </div>
        <span className="editorial-label" style={{ color: 'var(--ink-tertiary)', display: 'block', marginBottom: '4px' }}>
          Needs attention
        </span>
        <h3 className="editorial-headline" style={{ fontSize: '1.4rem', marginBottom: '8px' }}>
          Nothing to review yet
        </h3>
        <p style={{ fontSize: '0.9rem', color: 'var(--ink-secondary)', maxWidth: '480px', margin: '0 auto 24px auto', lineHeight: '1.5' }}>
          Check the plan to see what needs attention: the editing hours, working time, and client approvals across
          Morrow Studio.
        </p>
        {onCheckPlan && (
          <button
            type="button"
            onClick={onCheckPlan}
            disabled={isChecking}
            className="btn-editorial-primary pact-primary-action"
            data-testid="conflicts-check-plan"
            style={{ padding: '8px 22px' }}
          >
            {isChecking ? 'Checking plan…' : 'Check this plan'}
          </button>
        )}
      </div>
    );
  }

  const copy = describeCheck(checkResult);
  const margin = checkResult.availableHours - checkResult.requiredHours;
  const shortage = Math.abs(margin);
  let balanceLabel: string;
  let balanceValue: string;

  if (margin < 0) {
    balanceLabel = `${shortage} more ${shortage === 1 ? 'hour' : 'hours'} needed`;
    balanceValue = `-${shortage}h`;
  } else if (margin > 0) {
    balanceLabel = `${margin} extra ${margin === 1 ? 'hour' : 'hours'} available`;
    balanceValue = `+${margin}h`;
  } else {
    balanceLabel = 'Exact time match';
    balanceValue = '0h';
  }

  const isUnknown = checkResult.status === 'needs_information';

  if (isUnknown) {
    // Unknown durations mean no honest numeric balance can be shown.
    balanceLabel = 'Editing balance';
    balanceValue = 'Unknown';
  }

  const isInfeasible = checkResult.status === 'infeasible';
  const badgeClass = copy.tone === 'good' ? 'feasible' : copy.tone === 'attention' ? 'infeasible' : 'needs-info';
  const statusLabel =
    checkResult.status === 'feasible'
      ? 'Plan fits'
      : checkResult.status === 'infeasible'
      ? 'Needs a change'
      : checkResult.status === 'needs_information'
      ? 'More details needed'
      : 'Check incomplete';
  const StatusIcon =
    copy.tone === 'good' ? CheckCircle2 : copy.tone === 'attention' ? AlertTriangle : HelpCircle;
  const work = affectedWork(workspace, checkResult);
  const evidenceCount = checkResult.evidence?.length ?? 0;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '32px' }} data-testid="conflict-view" data-view="conflicts">
      {/* SECTION 1: ONE SHORT DIAGNOSIS + WORK/AVAILABLE METRICS */}
      <section>
        <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: '16px', flexWrap: 'wrap', gap: '8px' }}>
          <div>
            <span className="editorial-label">Needs attention</span>
            <h2 className="editorial-headline" style={{ fontSize: '1.35rem', marginTop: '2px' }}>
              {copy.headline}
            </h2>
          </div>
          <span
            className={`badge-status ${badgeClass}`}
            data-testid="conflict-status"
            style={{ fontSize: '0.8rem', padding: '4px 12px' }}
          >
            <StatusIcon size={14} />
            {statusLabel}
          </span>
        </div>

        <div
          className="paper-card pact-summary"
          data-testid="conflict-diagnosis"
          style={{
            padding: '24px 28px',
            backgroundColor: isInfeasible ? '#FCFAF5' : 'var(--paper-surface)',
            borderLeft: copy.tone === 'attention' ? '4px solid var(--clay-600)' : copy.tone === 'good' ? '4px solid var(--sage-600)' : '4px solid var(--sand-600)',
          }}
        >
          <p style={{ fontSize: '1.02rem', color: 'var(--ink-primary)', lineHeight: 1.55, maxWidth: '820px' }}>
            {copy.diagnosis}
          </p>

          {/* Work needed / time available, straight from the check result */}
          <div
            className="pact-stat-grid conflict-stat-grid"
            data-testid="conflict-metrics"
          >
            <div className="stat-card">
              <span className="editorial-label stat-label" style={{ fontSize: '0.72rem' }}>
                {isUnknown ? 'Known editing hours' : 'Editing needed'}
              </span>
              <div className="font-serif stat-value" style={{ fontWeight: 600, color: 'var(--ink-primary)' }}>
                {checkResult.requiredHours}h
              </div>
            </div>

            <div className="stat-card">
              <span className="editorial-label stat-label" style={{ fontSize: '0.72rem' }}>
                Time available
              </span>
              <div className="font-serif stat-value" style={{ fontWeight: 600, color: 'var(--ink-primary)' }}>
                {checkResult.availableHours}h
              </div>
            </div>

            <div className="stat-card stat-card-balance">
              <span className="editorial-label stat-label" style={{ fontSize: '0.72rem' }}>
                {balanceLabel}
              </span>
              <div
                className="font-serif stat-value"
                style={{
                  fontWeight: 600,
                  color: isUnknown ? 'var(--ink-secondary)' : margin < 0 ? 'var(--clay-700)' : 'var(--sage-700)',
                }}
              >
                {balanceValue}
              </div>
            </div>
          </div>

          {checkResult.status === 'needs_information' && (
            <p className="pact-inline-note" data-testid="conflict-unknown-note" style={{ fontSize: '0.78rem', color: 'var(--ink-tertiary)', marginTop: '14px' }}>
              Some jobs have unknown hours, so the known editing hours are only a partial total and the balance
              cannot be confirmed yet. PACT will not guess a duration.
            </p>
          )}
        </div>
      </section>

      {/* SECTION 2: AFFECTED WORK BY NAME */}
      {work.length > 0 && (
        <section>
          <span className="editorial-label" style={{ display: 'block', marginBottom: '10px' }}>
            Work involved
          </span>
          <ul
            className="pact-source-list"
            data-testid="affected-work"
            style={{ listStyle: 'none', display: 'flex', flexWrap: 'wrap', gap: '8px' }}
          >
            {work.map((item) => (
              <li
                key={item.id}
                style={{
                  fontSize: '0.85rem',
                  padding: '6px 12px',
                  backgroundColor: 'var(--paper-surface)',
                  border: '1px solid var(--paper-border-strong)',
                  borderRadius: 'var(--radius-xs)',
                  color: 'var(--ink-primary)',
                  fontWeight: 500,
                }}
              >
                {item.title}
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* SECTION 3: ONE CLEAR NEXT ACTION */}
      <section style={{ display: 'flex', justifyContent: 'flex-start' }}>
        <button
          type="button"
          onClick={onNavigateToRepairs}
          className={copy.tone === 'good' ? 'btn-editorial-sage pact-primary-action' : 'btn-editorial-clay pact-primary-action'}
          data-testid="conflict-next-action"
          style={{ fontSize: '0.85rem' }}
        >
          <span>See plan options</span>
          <ArrowRight size={14} />
        </button>
      </section>

      {/* SECTION 4: OPTIONAL TECHNICAL DETAILS (collapsed by default) */}
      <details className="pact-detail-toggle" data-testid="conflict-technical-details">
        <summary>How PACT checked this</summary>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', marginTop: '16px' }}>
          <p style={{ fontSize: '0.82rem', color: 'var(--ink-secondary)', lineHeight: 1.5 }}>
            PACT checks the whole plan against the briefs, working hours and client approvals, and never changes a
            result or hides a blocker. The exact wording and relationship paths from the check are kept below.
          </p>

          {checkResult.issues && checkResult.issues.length > 0 && (
            <div>
              <span className="editorial-label" style={{ fontSize: '0.72rem', display: 'block', marginBottom: '8px' }}>
                What the checker reported
              </span>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {checkResult.issues.map((issue, idx) => (
                  <div
                    key={idx}
                    className="paper-card-subtle"
                    style={{ padding: '12px 14px', display: 'flex', alignItems: 'flex-start', gap: '10px' }}
                  >
                    <AlertTriangle size={15} style={{ color: 'var(--clay-600)', flexShrink: 0, marginTop: '2px' }} />
                    <p style={{ fontSize: '0.84rem', color: 'var(--ink-primary)', lineHeight: 1.5 }}>{issue}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div>
            <span className="editorial-label" style={{ fontSize: '0.72rem', display: 'block', marginBottom: '8px' }}>
              Reasoning paths ({evidenceCount})
            </span>
            {evidenceCount > 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                {checkResult.evidence.map((path) => (
                  <div key={path.id} className="paper-card" style={{ padding: '16px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' }}>
                      <GitBranch size={15} style={{ color: 'var(--clay-700)' }} />
                      <span className="font-mono" style={{ fontSize: '0.75rem', fontWeight: 600 }}>
                        {path.id}
                      </span>
                    </div>

                    <p style={{ fontSize: '0.86rem', color: 'var(--ink-primary)', lineHeight: 1.5, marginBottom: '12px' }}>
                      {path.explanation}
                    </p>

                    {/* Node sequence, kept technical on purpose */}
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                        padding: '8px 12px',
                        backgroundColor: 'var(--paper-subtle)',
                        borderRadius: 'var(--radius-xs)',
                        overflowX: 'auto',
                        marginBottom: '12px',
                      }}
                    >
                      <span className="editorial-label" style={{ fontSize: '0.66rem', marginRight: '4px' }}>
                        Relationship:
                      </span>
                      {path.nodeIds.map((nodeId, nIdx) => (
                        <React.Fragment key={nIdx}>
                          <span
                            className="font-mono"
                            style={{
                              fontSize: '0.72rem',
                              padding: '2px 8px',
                              backgroundColor: 'var(--paper-surface)',
                              border: '1px solid var(--paper-border-strong)',
                              borderRadius: 'var(--radius-xs)',
                              fontWeight: 500,
                              whiteSpace: 'nowrap',
                            }}
                            title={formatNodeName(nodeId, workspace)}
                          >
                            {formatNodeName(nodeId, workspace)} ({nodeId})
                          </span>
                          {nIdx < path.nodeIds.length - 1 && (
                            <ArrowRight size={12} style={{ color: 'var(--ink-tertiary)', flexShrink: 0 }} />
                          )}
                        </React.Fragment>
                      ))}
                    </div>

                    {path.sourceIds && path.sourceIds.length > 0 && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                        <span style={{ fontSize: '0.7rem', color: 'var(--ink-tertiary)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                          Sources:
                        </span>
                        {path.sourceIds.map((srcId) => {
                          const src = workspace.sources.find((s) => s.id === srcId);
                          return (
                            <button
                              key={srcId}
                              type="button"
                              onClick={() => onOpenSourceDrawer(srcId)}
                              className="btn-editorial-secondary"
                              style={{ padding: '3px 8px', fontSize: '0.72rem', display: 'flex', alignItems: 'center', gap: '4px' }}
                            >
                              <FileText size={11} />
                              {src?.title || 'Source unavailable'}
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <p style={{ fontSize: '0.82rem', color: 'var(--ink-tertiary)' }}>
                No reasoning paths were recorded for this check.
              </p>
            )}
          </div>

          {checkResult.assumptions && checkResult.assumptions.length > 0 && (
            <div>
              <span className="editorial-label" style={{ fontSize: '0.72rem', display: 'block', marginBottom: '8px' }}>
                Assumptions PACT made
              </span>
              <ul style={{ paddingLeft: '18px', fontSize: '0.8rem', color: 'var(--ink-secondary)', lineHeight: 1.6 }}>
                {checkResult.assumptions.map((assump, aIdx) => (
                  <li key={aIdx}>{assump}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </details>
    </div>
  );
}
