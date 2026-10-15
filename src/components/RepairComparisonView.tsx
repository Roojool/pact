'use client';

import React from 'react';
import { Workspace, Analysis, Proposal, PlanChange } from '@/lib/types';
import {
  ArrowRightLeft,
  CheckCircle2,
  AlertTriangle,
  ShieldCheck,
  FileCheck,
  HelpCircle,
  FileText,
} from 'lucide-react';

interface RepairComparisonProps {
  workspace: Workspace | null;
  analysis: Analysis | null;
  onApproveProposal: (proposalId: string) => Promise<void>;
  onOpenSourceDrawer: (sourceId?: string) => void;
  isApproving: boolean;
  onCheckPlan?: () => void;
  isChecking?: boolean;
}

function formatEditorNames(text: string, editors: { id: string; name: string }[]): string {
  let res = text;
  for (const ed of editors) {
    res = res.replaceAll(ed.id, ed.name);
  }
  return res;
}

function describeChange(change: PlanChange, workspace: Workspace): string {
  const commitment = workspace.commitments.find((c) => c.id === change.commitmentId);
  const title = commitment?.title ?? 'this job';
  if (change.deadlineDay !== undefined) return `Move ${title} to Day ${change.deadlineDay}`;
  if (change.editorId !== undefined) {
    const editor = workspace.editors.find((e) => e.id === change.editorId);
    return `Assign ${editor?.name ?? 'this editor'} to ${title}`;
  }
  return title;
}

function whyItHelps(proposal: Proposal): string {
  if (proposal.status === 'rejected') {
    return 'Considered and rejected: the client has not approved this editor for this job, so PACT will not schedule them.';
  }
  const result = proposal.result;
  if (result?.status === 'feasible') {
    return `This makes the whole plan fit: ${result.requiredHours}h of editing within ${result.availableHours}h available before these deadlines.`;
  }
  if (result?.status === 'needs_information') {
    return 'This confirms the missing editing hours so the job can be scheduled.';
  }
  return 'This option does not resolve the plan on its own yet.';
}

function tradeOff(proposal: Proposal, workspace: Workspace): string | null {
  if (proposal.status === 'rejected') return null;
  const deadlineChange = proposal.changes.find((c) => c.deadlineDay !== undefined);
  if (deadlineChange) {
    const commitment = workspace.commitments.find((c) => c.id === deadlineChange.commitmentId);
    return `Trade-off: ${commitment?.title ?? 'this job'} would finish on Day ${deadlineChange.deadlineDay} instead of its original day.`;
  }
  const editorChange = proposal.changes.find((c) => c.editorId !== undefined);
  if (editorChange) {
    const editor = workspace.editors.find((e) => e.id === editorChange.editorId);
    return `Trade-off: this uses ${editor?.name ?? 'this editor'}'s remaining working time.`;
  }
  return null;
}

export function RepairComparisonView({
  workspace,
  analysis,
  onApproveProposal,
  onOpenSourceDrawer,
  isApproving,
  onCheckPlan,
  isChecking,
}: RepairComparisonProps) {
  if (!workspace) return null;

  // Proposals must come from the verified analysis of the current workspace.
  const proposals: Proposal[] = (analysis?.proposals ?? []).filter(
    (p) => p.revision === workspace.revision - 1 || p.revision === workspace.revision
  );

  if (proposals.length === 0) {
    return (
      <div className="pact-empty-state paper-card" data-testid="options-empty" style={{ padding: '48px 36px', textAlign: 'center', maxWidth: '680px', margin: '40px auto' }}>
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
          <ArrowRightLeft size={24} />
        </div>
        <span className="editorial-label" style={{ color: 'var(--ink-tertiary)', display: 'block', marginBottom: '4px' }}>
          Plan options
        </span>
        <h3 className="editorial-headline" style={{ fontSize: '1.4rem', marginBottom: '8px' }}>
          No plan options yet
        </h3>
        <p style={{ fontSize: '0.9rem', color: 'var(--ink-secondary)', maxWidth: '480px', margin: '0 auto 24px auto', lineHeight: '1.5' }}>
          Check the plan to see the changes that would make it work. Nothing is approved until you approve it.
        </p>
        {onCheckPlan && (
          <button
            type="button"
            onClick={onCheckPlan}
            disabled={isChecking}
            className="btn-editorial-primary pact-primary-action"
            data-testid="options-check-plan"
            style={{ padding: '8px 22px' }}
          >
            {isChecking ? 'Checking plan…' : 'Check this plan'}
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="wrap" style={{ display: 'flex', flexDirection: 'column', gap: '32px', paddingTop: '1.5rem', paddingBottom: '4rem' }} data-testid="options-view" data-view="repairs">
      {/* SECTION 1: HEADER & INTRO */}
      <div className="editorial-section-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <svg width="38" height="38" viewBox="0 0 100 100" aria-hidden="true" style={{ flexShrink: 0 }}>
            <use href="#sf" />
          </svg>
          <div>
            <span className="editorial-section-number">01</span>
            <span className="editorial-label">Plan options</span>
            <h2 className="editorial-headline" style={{ fontSize: '2.2rem', marginTop: '2px' }}>
              What we can change
            </h2>
          </div>
        </div>
        <span className="mono" style={{ fontSize: '0.8rem', color: 'var(--ink-tertiary)' }}>
          {proposals.length} options evaluated
        </span>
      </div>

      <p style={{ fontSize: '0.92rem', color: 'var(--ink-secondary)', maxWidth: '780px', marginTop: '-12px' }}>
        Each option shows the change, why it helps, and any trade-off. You approve one at a time — PACT never
        approves for you.
      </p>

      {/* SECTION 2: OPTION CARDS — Two Clear Decisions (One Ready, One Blocked) */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))', gap: '20px' }}>
        {proposals.map((proposal, idx) => {
          const isCurrentChecked = analysis !== null;
          // Stale when the revision moved on OR any tracked source changed since the check.
          const isStale =
            (proposal.revision !== workspace.revision - 1 && proposal.revision !== workspace.revision) ||
            Object.entries(proposal.sourceVersions ?? {}).some(
              ([srcId, ver]) => (workspace.sources.find((s) => s.id === srcId)?.revision ?? -1) !== ver
            );
          const isApproved = proposal.status === 'approved';
          const isRejected = proposal.status === 'rejected';

          let statusLabel = 'Needs more time';
          let badgeClass = 'infeasible';
          let isFeasible = false;

          if (!isCurrentChecked) {
            statusLabel = 'Not checked yet';
            badgeClass = 'neutral';
          } else if (isApproved) {
            statusLabel = 'Approved';
            badgeClass = 'feasible';
            isFeasible = true;
          } else if (isRejected || proposal.result?.status === 'infeasible') {
            const issues =
              (proposal.result?.issues?.join(' ') ?? '') +
              ' ' +
              (proposal.result?.summary ?? '') +
              ' ' +
              proposal.title +
              ' ' +
              proposal.description;
            const isPolicy =
              proposal.status === 'rejected' || /policy|not approved|unapproved|eligibility|blocked/i.test(issues);
            statusLabel = isPolicy ? 'Blocked by client approval' : 'Needs more time';
            badgeClass = 'infeasible';
          } else if (proposal.result?.status === 'feasible') {
            statusLabel = 'Ready to approve';
            badgeClass = 'feasible';
            isFeasible = true;
          } else if (proposal.result?.status === 'needs_information') {
            statusLabel = 'More details needed';
            badgeClass = 'needs-info';
          } else if (proposal.result?.status === 'search_limit') {
            statusLabel = 'Check incomplete';
            badgeClass = 'infeasible';
          }

          const canApprove = isFeasible && !isStale && isCurrentChecked && proposal.status === 'proposed';
          const change = tradeOff(proposal, workspace);
          const BadgeIcon = isFeasible ? CheckCircle2 : !isCurrentChecked ? HelpCircle : AlertTriangle;

          return (
            <article
              key={proposal.id}
              className="paper-card pact-option-card"
              data-testid={`option-${proposal.id}`}
              style={{
                padding: '24px',
                display: 'flex',
                flexDirection: 'column',
                gap: '16px',
                borderTop: isFeasible
                  ? '3px solid var(--forest-base)'
                  : !isCurrentChecked
                  ? '3px solid var(--paper-border-strong)'
                  : '3px solid var(--orange-base)',
                backgroundColor: isApproved ? 'var(--forest-light)' : 'var(--paper-surface)',
              }}
            >
              {/* Option Header */}
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '10px' }}>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px', flexWrap: 'wrap' }}>
                    <span className="editorial-section-number">DECISION 0{idx + 1}</span>
                    <span className={`badge-status ${badgeClass}`} data-testid={`option-status-${proposal.id}`} style={{ fontSize: '0.72rem' }}>
                      <BadgeIcon size={12} />
                      {statusLabel}
                    </span>
                    {isApproved && (
                      <span className="badge-status feasible" style={{ fontSize: '0.72rem' }}>
                        <FileCheck size={12} />
                        In saved plan
                      </span>
                    )}
                  </div>
                  <h3 className="editorial-headline" style={{ fontSize: '1.25rem' }}>
                    {proposal.title}
                  </h3>
                </div>
              </div>

              {/* The change */}
              {proposal.changes.length > 0 && (
                <div>
                  <span className="editorial-label" style={{ fontSize: '0.7rem', display: 'block', marginBottom: '8px' }}>
                    The change
                  </span>
                  <ul style={{ listStyle: 'none', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {proposal.changes.map((c, cIdx) => {
                      const commitment = workspace.commitments.find((x) => x.id === c.commitmentId);
                      const campaign = workspace.campaigns.find((x) => x.id === commitment?.campaignId);
                      return (
                        <li
                          key={cIdx}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            gap: '8px',
                            fontSize: '0.84rem',
                            backgroundColor: 'var(--paper-subtle)',
                            padding: '8px 10px',
                            border: '1px solid var(--paper-border)',
                            borderRadius: 'var(--radius-xs)',
                          }}
                        >
                          <span style={{ fontWeight: 600 }}>{describeChange(c, workspace)}</span>
                          {campaign && (
                            <span style={{ fontSize: '0.72rem', color: 'var(--ink-tertiary)', whiteSpace: 'nowrap' }}>
                              {campaign.brand}
                            </span>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                </div>
              )}

              {/* Why it helps */}
              <div>
                <span className="editorial-label" style={{ fontSize: '0.7rem', display: 'block', marginBottom: '4px' }}>
                  Why it helps
                </span>
                <p style={{ fontSize: '0.86rem', color: 'var(--ink-secondary)', lineHeight: 1.5 }}>
                  {whyItHelps(proposal)}
                </p>
              </div>

              {/* Trade-off */}
              {change && (
                <p className="pact-inline-note" style={{ fontSize: '0.8rem', color: 'var(--ink-tertiary)', lineHeight: 1.45 }}>
                  {change}
                </p>
              )}

              {/* One approval action, with the same disabled guards as before */}
              <div style={{ marginTop: 'auto', paddingTop: '12px', borderTop: '1px solid var(--paper-border)' }}>
                {isApproved ? (
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '6px',
                      padding: '8px',
                      color: 'var(--forest-base)',
                      fontSize: '0.84rem',
                      fontWeight: 600,
                    }}
                  >
                    <CheckCircle2 size={16} />
                    Approved and recorded in Saved plan
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => onApproveProposal(proposal.id)}
                    disabled={isApproving || !isFeasible || isStale || !isCurrentChecked || proposal.status !== 'proposed'}
                    data-testid={`approve-${proposal.id}`}
                    className={canApprove ? 'btn-editorial-sage pact-primary-action' : 'btn-editorial-secondary'}
                    style={{
                      width: '100%',
                      padding: '9px 16px',
                      opacity: canApprove ? 1 : 0.6,
                      cursor: canApprove ? 'pointer' : 'not-allowed',
                    }}
                    title={
                      isStale
                        ? 'Cannot approve a stale option: the plan changed, check again'
                        : !isCurrentChecked
                        ? 'Run "Check this plan" to verify feasibility before approving'
                        : !isFeasible
                        ? `Cannot approve this option: ${statusLabel}`
                        : proposal.status !== 'proposed'
                        ? `This option is already ${proposal.status}`
                        : 'Approve this option and save the plan'
                    }
                  >
                    {isApproving ? (
                      'Saving approved plan…'
                    ) : isStale ? (
                      'Plan changed — check again'
                    ) : !isCurrentChecked ? (
                      'Check the plan to verify this option'
                    ) : canApprove ? (
                      <>
                        <ShieldCheck size={14} />
                        Approve this option
                      </>
                    ) : (
                      statusLabel
                    )}
                  </button>
                )}
              </div>

              {/* Optional technical details, collapsed by default */}
              <details data-testid={`option-details-${proposal.id}`}>
                <summary>Full check &amp; sources</summary>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginTop: '10px' }}>
                  <p style={{ fontSize: '0.78rem', color: 'var(--ink-secondary)', lineHeight: 1.5 }}>
                    {formatEditorNames(proposal.description, workspace.editors)}
                  </p>

                  {proposal.result && (
                    <p style={{ fontSize: '0.78rem', color: 'var(--ink-secondary)' }}>
                      {proposal.result.requiredHours}h needed, {proposal.result.availableHours}h available.{' '}
                      <em>{formatEditorNames(proposal.result.summary, workspace.editors)}</em>
                    </p>
                  )}

                  <div className="pact-source-list" style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                    <span style={{ fontSize: '0.7rem', color: 'var(--ink-tertiary)', textTransform: 'uppercase' }}>
                      Sources:
                    </span>
                    {proposal.sourceVersions && Object.keys(proposal.sourceVersions).length > 0 ? (
                      Object.entries(proposal.sourceVersions).map(([srcId, ver]) => {
                        const src = workspace.sources.find((s) => s.id === srcId);
                        return (
                          <button
                            key={srcId}
                            type="button"
                            onClick={() => onOpenSourceDrawer(src ? srcId : undefined)}
                            className="btn-editorial-secondary"
                            style={{ padding: '2px 8px', fontSize: '0.72rem', display: 'flex', alignItems: 'center', gap: '4px' }}
                          >
                            <FileText size={11} />
                            {src ? src.title : 'Source unavailable — view all records'}
                          </button>
                        );
                      })
                    ) : (
                      <span style={{ fontSize: '0.75rem', color: 'var(--ink-tertiary)' }}>No sources recorded.</span>
                    )}
                  </div>

                  <span className="font-mono" style={{ fontSize: '0.7rem', color: 'var(--ink-tertiary)' }}>
                    Option id: {proposal.id} · plan revision r{proposal.revision}
                  </span>
                </div>
              </details>
            </article>
          );
        })}
      </div>
    </div>
  );
}
