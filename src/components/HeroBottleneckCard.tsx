'use client';

import React from 'react';
import { Workspace, Analysis } from '@/lib/types';
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
  const margin = check ? check.availableHours - check.requiredHours : 0;

  const sourceId = check?.evidence
    ?.flatMap((path) => path.sourceIds)
    .find((id) => workspace.sources.some((source) => source.id === id));

  const copy = check ? describeCheck(check) : null;

  return (
    <section className="hero grain" data-testid="hero-card" aria-labelledby="plan-headline">
      {/* Golden Hour Authoritative Layered Green Hills with Sunflowers */}
      <svg className="land" viewBox="0 0 1440 300" preserveAspectRatio="xMidYMax slice" aria-hidden="true">
        <path d="M0 120C240 60 420 90 640 118S1040 70 1240 90S1400 110 1440 100V300H0Z" fill="#35592F" />
        <path d="M0 175C260 140 460 165 700 180S1100 150 1440 170V300H0Z" fill="#1F3B22" />
        <use href="#sf" x="-20" y="190" width="150" height="150" />
        <use href="#sf" x="130" y="225" width="110" height="110" />
        <use href="#sf" x="240" y="185" width="140" height="140" />
        <use href="#sf" x="400" y="230" width="105" height="105" />
        <use href="#sf" x="520" y="195" width="150" height="150" />
        <use href="#sf" x="690" y="235" width="110" height="110" />
        <use href="#sf" x="790" y="190" width="145" height="145" />
        <use href="#sf" x="950" y="232" width="105" height="105" />
        <use href="#sf" x="1060" y="188" width="150" height="150" />
        <use href="#sf" x="1230" y="228" width="110" height="110" />
        <use href="#sf" x="1330" y="195" width="140" height="140" />
      </svg>

      {/* Real Oversized Cropped Sunflower Blooming in Top-Right */}
      <svg className="bloom" viewBox="0 0 100 100" aria-hidden="true">
        <use href="#sf" />
      </svg>

      {/* Hero Content Stage */}
      <div className="wrap hero-in">
        <p className="mono hero-kicker">Campaigns. People. Promises. · Morrow Studio</p>

        <h1>
          <span className="d">Good work.<br />Better planned.</span>
          <span className="it">before you commit.</span>
        </h1>

        <div className="hero-bot">
          {/* Left Column: Studio Guidance & Secondary Actions */}
          <div className="stack">
            <p className="pact-summary" data-testid="hero-summary">
              {copy?.diagnosis ??
                'Three campaigns share the same studio time. Check the whole plan against briefs, working hours, and client approvals before you commit.'}
            </p>

            <div className="hero-actions">
              <button
                type="button"
                onClick={() => onOpenSourceDrawer(sourceId)}
                className="pill"
                data-testid="hero-open-sources"
              >
                <svg className="ic"><use href="#ar" /></svg> Read the sources
              </button>

              <a href="#studio-work" className="pill">
                <svg className="ic" style={{ transform: 'rotate(90deg)' }}><use href="#ar" /></svg> View your work
              </a>
            </div>
          </div>

          {/* Right Column: Featured-Issue Style Paper Card with Real Data State */}
          <aside className="feat">
            <span
              className="mono"
              style={{
                color: blocked ? 'var(--red)' : feasible ? 'var(--leaf)' : 'var(--muted)',
                fontWeight: 700,
              }}
            >
              {feasible
                ? 'Plan status · Feasible'
                : blocked
                ? 'Plan status · Needs attention'
                : 'Plan status · Ready to check'}
            </span>

            <h2 className="d" id="plan-headline">
              {check ? (
                blocked ? (
                  margin < 0 ? `${Math.abs(margin)} hours short` : 'Needs attention'
                ) : feasible ? (
                  'All hours fit'
                ) : (
                  copy?.headline ?? 'Check complete'
                )
              ) : (
                'Ready to check'
              )}
            </h2>

            <p>
              {check ? (
                blocked ? (
                  `${check.requiredHours}h required editing vs ${check.availableHours}h approved available. ${check.conflictIds.length} conflicting commitments.`
                ) : feasible ? (
                  `${check.requiredHours}h required within ${check.availableHours}h approved capacity. Zero conflicts detected.`
                ) : (
                  copy?.diagnosis ?? 'Review plan constraints'
                )
              ) : (
                `${workspace.campaigns.length} campaigns · ${workspace.commitments.length} commitments · ${workspace.editors.length} editors`
              )}
            </p>

            <div className="tags">
              <span className="tag">{workspace.campaigns.length} campaigns</span>
              <span className="tag">{workspace.commitments.length} commitments</span>
              <span className="tag">
                {check ? (analysis?.mode === 'live' ? 'AI assisted' : 'Rules verified') : 'Awaiting check'}
              </span>
            </div>

            {check ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', width: '100%' }}>
                <button
                  type="button"
                  onClick={onNavigateToRepairs}
                  className="pill red pact-primary-action"
                  data-testid="hero-see-options"
                >
                  <svg className="ic"><use href="#ar" /></svg> See plan options
                </button>
                <button
                  type="button"
                  onClick={onNavigateToConflicts}
                  className="pill"
                  data-testid="hero-see-attention"
                >
                  What needs attention
                </button>
              </div>
            ) : (
              onCheckPlan && (
                <button
                  type="button"
                  onClick={onCheckPlan}
                  disabled={isChecking}
                  className="pill red pact-primary-action"
                  data-testid="hero-check-plan"
                >
                  <svg className="ic"><use href="#ar" /></svg>{' '}
                  {isChecking ? 'Checking plan…' : 'Check this plan'}
                </button>
              )
            )}
          </aside>
        </div>
      </div>
    </section>
  );
}
