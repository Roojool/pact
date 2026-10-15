'use client';

import React from 'react';
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

/**
 * Code-native sunflower / horizon composition anchor:
 * Warm ochre/orange disc, olive/forest stems & hills, cream negative space.
 * Pure CSS/SVG, aria-hidden="true" decorative anchor.
 */
function SunflowerHorizonAnchor() {
  return (
    <svg
      width="48"
      height="36"
      viewBox="0 0 48 36"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      style={{ flexShrink: 0 }}
    >
      {/* Warm ochre sun disc */}
      <circle cx="24" cy="22" r="14" fill="var(--sunflower-base)" />
      {/* Burnt orange horizon glow arc */}
      <path
        d="M4 23C10 21 17 20 24 20C31 20 38 21 44 23"
        stroke="var(--orange-base)"
        strokeWidth="1.75"
        strokeLinecap="round"
      />
      {/* Deep olive / forest green hills */}
      <path
        d="M0 27C8 24 16 25 24 27C32 29 40 26 48 27V36H0V27Z"
        fill="var(--forest-base)"
      />
      {/* Architectural petal / ray flourish */}
      <path
        d="M24 7C24.8 11.5 25.5 13.5 24 16C22.5 13.5 23.2 11.5 24 7Z"
        fill="var(--orange-base)"
      />
      <path
        d="M16 10C19.5 12.5 20.5 14.5 19 16.5C17.5 15.5 16 13 16 10Z"
        fill="var(--sunflower-base)"
        opacity="0.9"
      />
      <path
        d="M32 10C28.5 12.5 27.5 14.5 29 16.5C30.5 15.5 32 13 32 10Z"
        fill="var(--sunflower-base)"
        opacity="0.9"
      />
    </svg>
  );
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
  const sourceId = check?.evidence
    ?.flatMap((path) => path.sourceIds)
    .find((id) => workspace.sources.some((source) => source.id === id));

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
      className="pact-editorial-hero"
      data-testid="hero-card"
      aria-labelledby="plan-headline"
      style={{
        borderLeft: `4px solid ${
          feasible
            ? 'var(--forest-base)'
            : blocked
            ? 'var(--orange-base)'
            : 'var(--paper-border-strong)'
        }`,
      }}
    >
      {/* Top Meta Line: Status Badge + Studio Label + Horizon Anchor */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '12px',
          marginBottom: '10px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <span className={`badge-status ${feasible ? 'feasible' : blocked ? 'infeasible' : 'neutral'}`}>
            {feasible ? <CheckCircle2 size={13} /> : blocked ? <AlertCircle size={13} /> : <HelpCircle size={13} />}
            {check ? labels[check.status] : 'Ready to check'}
          </span>
          <span className="editorial-label">Morrow Studio · Planning Desk</span>
        </div>
        <SunflowerHorizonAnchor />
      </div>

      {/* Expressive Editorial Headline (roughly 48-60px desktop, 32-38px mobile) */}
      <h2
        id="plan-headline"
        className="editorial-hero-headline"
      >
        {title ? (
          title.includes('short') ? (
            <>
              {title.split('short')[0]}
              <em className="editorial-hero-italic-orange">short{title.split('short')[1]}</em>
            </>
          ) : (
            <>
              {title}{' '}
              <em className="editorial-hero-italic">
                {feasible ? '— ready to commit' : ''}
              </em>
            </>
          )
        ) : (
          <>
            Good work. <em className="editorial-hero-italic">Better planned.</em>
          </>
        )}
      </h2>

      {/* One Plain-Language Supporting Sentence */}
      <p
        className="pact-summary"
        data-testid="hero-summary"
        style={{
          maxWidth: '780px',
          marginTop: '6px',
          marginBottom: '18px',
          color: 'var(--ink-secondary)',
          lineHeight: 1.55,
        }}
      >
        {copy?.diagnosis ??
          'Three campaigns share the same studio time. Check the whole plan against briefs, working hours, and client approvals before you commit.'}
      </p>

      {/* Action Row: ONE Clear Main Action + Secondary Links */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '12px',
          paddingTop: '14px',
          borderTop: '1px solid var(--paper-border)',
        }}
      >
        <button
          type="button"
          onClick={() => onOpenSourceDrawer(sourceId)}
          className="btn-editorial-secondary"
          data-testid="hero-open-sources"
        >
          <FileText size={13} /> Read the sources
        </button>

        {check ? (
          <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
            <button
              type="button"
              onClick={onNavigateToConflicts}
              className="btn-editorial-secondary"
              data-testid="hero-see-attention"
            >
              What needs attention
            </button>
            <button
              type="button"
              onClick={onNavigateToRepairs}
              className="btn-editorial-primary pact-primary-action"
              data-testid="hero-see-options"
            >
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
