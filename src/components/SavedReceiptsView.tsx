'use client';

import React from 'react';
import { Workspace, Decision } from '@/lib/types';
import {
  CheckCircle2,
  KeyRound,
  FileCheck,
  Clock,
  FileText,
} from 'lucide-react';

interface SavedReceiptsProps {
  workspace: Workspace | null;
  onOpenSourceDrawer: (sourceId: string) => void;
  onNavigateToOverview: () => void;
}

/** Slots 0..7 are Day 1 09:00–17:00; 8..15 are Day 2 09:00–17:00. */
function slotLabel(slot: number): string {
  const day = slot < 8 ? 1 : 2;
  const hour = 9 + (slot < 8 ? slot : slot - 8);
  return `Day ${day} · ${hour}:00`;
}

export function SavedReceiptsView({
  workspace,
  onOpenSourceDrawer,
  onNavigateToOverview,
}: SavedReceiptsProps) {
  if (!workspace) return null;

  const decisions: Decision[] = workspace.decisions ?? [];

  if (decisions.length === 0) {
    return (
      <div className="pact-empty-state paper-card" data-testid="receipts-empty" style={{ padding: '48px 36px', textAlign: 'center', maxWidth: '640px', margin: '40px auto' }}>
        <FileCheck size={36} style={{ color: 'var(--ink-tertiary)', margin: '0 auto 12px auto' }} />
        <span className="editorial-label" style={{ color: 'var(--ink-tertiary)', display: 'block', marginBottom: '4px' }}>
          Saved plan
        </span>
        <h3 className="editorial-headline" style={{ fontSize: '1.4rem', marginBottom: '8px' }}>
          Nothing saved yet
        </h3>
        <p style={{ fontSize: '0.9rem', color: 'var(--ink-secondary)', maxWidth: '440px', margin: '0 auto 24px auto', lineHeight: '1.5' }}>
          When you approve a plan option, the booked work time and the follow-up tasks are saved here.
        </p>
        <button
          type="button"
          onClick={onNavigateToOverview}
          className="btn-editorial-primary pact-primary-action"
          data-testid="receipts-back"
          style={{ padding: '8px 20px', fontSize: '0.85rem' }}
        >
          Go to your work
        </button>
      </div>
    );
  }

  return (
    <div className="wrap" style={{ display: 'flex', flexDirection: 'column', gap: '32px', paddingTop: '1.5rem', paddingBottom: '4rem' }} data-testid="receipts-view" data-view="receipts">
      <div className="editorial-section-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <svg width="38" height="38" viewBox="0 0 100 100" aria-hidden="true" style={{ flexShrink: 0 }}>
            <use href="#sf" />
          </svg>
          <div>
            <span className="editorial-section-number">01</span>
            <span className="editorial-label">Saved plan</span>
            <h2 className="editorial-headline" style={{ fontSize: '2.2rem', marginTop: '2px' }}>
              Decisions you have approved
            </h2>
          </div>
        </div>
        <span className="mono" style={{ fontSize: '0.8rem', color: 'var(--ink-tertiary)' }}>
          {decisions.length} recorded bookings
        </span>
      </div>

      <p style={{ fontSize: '0.92rem', color: 'var(--ink-secondary)', maxWidth: '780px', marginTop: '-12px' }}>
        Each entry below is an internal booking for your business. Approving never publishes or contacts anyone.
      </p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
        {decisions.map((decision) => (
          <article
            key={decision.id}
            className="paper-card"
            data-testid={`receipt-${decision.id}`}
            style={{
              padding: '28px',
              borderLeft: '4px solid var(--sage-600)',
              display: 'flex',
              flexDirection: 'column',
              gap: '20px',
            }}
          >
            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px' }}>
              <div>
                <span className="badge-status feasible" style={{ fontSize: '0.72rem' }}>
                  <CheckCircle2 size={12} />
                  Approved
                </span>
                <h3 className="editorial-headline" style={{ fontSize: '1.3rem', marginTop: '8px' }}>
                  {decision.title}
                </h3>
              </div>

              <div style={{ textAlign: 'right', fontSize: '0.75rem', color: 'var(--ink-tertiary)' }}>
                <div>Saved {new Date(decision.createdAt).toLocaleString()}</div>
              </div>
            </div>

            {/* Why this decision was made */}
            {decision.note && (
              <div
                style={{
                  backgroundColor: 'var(--paper-subtle)',
                  padding: '12px 16px',
                  borderRadius: 'var(--radius-xs)',
                  fontFamily: 'var(--font-serif)',
                  fontSize: '0.92rem',
                  color: 'var(--ink-primary)',
                  borderLeft: '3px solid var(--sage-600)',
                }}
              >
                &ldquo;{decision.note}&rdquo;
              </div>
            )}

            {/* Booked work time */}
            {decision.allocations && decision.allocations.length > 0 && (
              <div>
                <span className="editorial-label" style={{ fontSize: '0.72rem', display: 'block', marginBottom: '10px' }}>
                  Booked work time
                </span>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '10px' }}>
                  {decision.allocations.map((alloc, aIdx) => {
                    const commitment = workspace.commitments.find((c) => c.id === alloc.commitmentId);
                    const editor = workspace.editors.find((e) => e.id === alloc.editorId);
                    const campaign = workspace.campaigns.find((c) => c.id === commitment?.campaignId);

                    return (
                      <div
                        key={aIdx}
                        style={{
                          padding: '12px 14px',
                          backgroundColor: 'var(--paper-subtle)',
                          border: '1px solid var(--paper-border)',
                          borderRadius: 'var(--radius-xs)',
                          display: 'flex',
                          flexDirection: 'column',
                          gap: '4px',
                        }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px' }}>
                          <span style={{ fontWeight: 600, fontSize: '0.85rem' }}>
                            {commitment?.title || 'This job'}
                          </span>
                          <span className="badge-status neutral" style={{ fontSize: '0.68rem', padding: '1px 6px' }}>
                            {editor?.name || 'Team member'}
                          </span>
                        </div>

                        {campaign && (
                          <div style={{ fontSize: '0.75rem', color: 'var(--ink-secondary)' }}>
                            {campaign.name}
                          </div>
                        )}

                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '4px', flexWrap: 'wrap' }}>
                          <Clock size={12} style={{ color: 'var(--ink-tertiary)' }} />
                          {alloc.slots.map((s) => (
                            <span
                              key={s}
                              style={{
                                fontSize: '0.72rem',
                                padding: '1px 6px',
                                backgroundColor: s < 8 ? 'var(--clay-100)' : 'var(--sage-100)',
                                color: s < 8 ? 'var(--clay-800)' : 'var(--sage-800)',
                                borderRadius: 'var(--radius-xs)',
                              }}
                            >
                              {slotLabel(s)}
                            </span>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Next tasks */}
            {decision.tasks && decision.tasks.length > 0 && (
              <div>
                <span className="editorial-label" style={{ fontSize: '0.72rem', display: 'block', marginBottom: '10px' }}>
                  What happens next
                </span>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {decision.tasks.map((task) => {
                    const owner = workspace.people.find((p) => p.id === task.ownerId);
                    const isDone = task.status === 'done';

                    return (
                      <div
                        key={task.id}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          gap: '10px',
                          padding: '10px 14px',
                          backgroundColor: 'var(--paper-surface)',
                          border: '1px solid var(--paper-border)',
                          borderRadius: 'var(--radius-xs)',
                        }}
                      >
                        <span
                          style={{
                            fontSize: '0.85rem',
                            color: isDone ? 'var(--ink-tertiary)' : 'var(--ink-primary)',
                            textDecoration: isDone ? 'line-through' : 'none',
                          }}
                        >
                          {task.title}
                        </span>

                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <span style={{ fontSize: '0.75rem', color: 'var(--ink-secondary)', whiteSpace: 'nowrap' }}>
                            {owner?.name || 'Producer'}
                          </span>
                          <span
                            className={`badge-status ${isDone ? 'feasible' : 'neutral'}`}
                            style={{ fontSize: '0.68rem', padding: '1px 8px' }}
                          >
                            {isDone ? 'Done' : 'To do'}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Optional technical details, collapsed by default */}
            <details className="pact-detail-toggle" data-testid={`receipt-details-${decision.id}`}>
              <summary>Technical details</summary>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginTop: '12px', fontSize: '0.72rem', color: 'var(--ink-tertiary)' }}>
                <div className="font-mono" style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <KeyRound size={11} />
                  <span>Idempotency key: {decision.idempotencyKey}</span>
                </div>
                <span className="font-mono">
                  Decision id: {decision.id} · plan revision r{decision.revision}
                </span>

                {decision.sourceVersions && Object.keys(decision.sourceVersions).length > 0 && (
                  <div className="pact-source-list" style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                    <span style={{ textTransform: 'uppercase', letterSpacing: '0.06em' }}>Sources used:</span>
                    {Object.entries(decision.sourceVersions).map(([srcId, ver]) => {
                      const src = workspace.sources.find((s) => s.id === srcId);
                      return (
                        <button
                          key={srcId}
                          type="button"
                          onClick={() => onOpenSourceDrawer(src ? srcId : '')}
                          className="btn-editorial-secondary"
                          style={{ padding: '1px 8px', fontSize: '0.72rem', display: 'flex', alignItems: 'center', gap: '4px' }}
                        >
                          <FileText size={11} />
                          {src ? `${src.title} (r${ver})` : 'Source unavailable — view all records'}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            </details>
          </article>
        ))}
      </div>
    </div>
  );
}
