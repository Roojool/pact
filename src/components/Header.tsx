'use client';

import React from 'react';
import { Workspace, Analysis } from '@/lib/types';
import { RefreshCw, Play, RotateCcw, Sparkles, Database, ShieldCheck, HelpCircle } from 'lucide-react';

interface HeaderProps {
  workspace: Workspace | null;
  analysis: Analysis | null;
  health: {
    ok?: boolean;
    liveAvailable?: boolean;
    graphConnected?: boolean;
    database?: boolean;
    [key: string]: unknown;
  } | null;
  isLiveAiEnabled: boolean;
  onToggleLiveAi: (enabled: boolean) => void;
  onAnalyze: () => void;
  onResetClick: () => void;
  isAnalyzing: boolean;
}

export function Header({
  workspace,
  analysis,
  health,
  isLiveAiEnabled,
  onToggleLiveAi,
  onAnalyze,
  onResetClick,
  isAnalyzing,
}: HeaderProps) {
  const isLiveCapable = Boolean(health?.liveAvailable);

  // Do not infer healthy on an unknown state.
  const isHealthKnown = health !== null && typeof health === 'object';
  const isServiceOk = isHealthKnown && Boolean(health.graphConnected ?? health.ok ?? health.database);

  // Truthful mode wording: never imply an AI call happened in rules mode.
  const currentMode = analysis?.mode ?? 'deterministic';
  const modeLabel = currentMode === 'live' ? 'AI-assisted check' : 'Rules check';

  return (
    <header className="pact-masthead" data-testid="masthead">
      {/* Masthead Left: studio identity only, no revision jargon up front */}
      <div className="masthead-identity" style={{ display: 'flex', alignItems: 'center', gap: '18px' }}>
        <div>
          <span className="editorial-subhead" style={{ color: 'var(--clay-700)', letterSpacing: '0.12em' }}>
            Morrow Studio
          </span>
          <h1 className="editorial-headline" style={{ fontSize: '1.45rem', marginTop: '2px' }}>
            Your studio plan
          </h1>
        </div>
      </div>

      {/* Masthead Right: health, mode, optional details, and the two real actions */}
      <div className="masthead-controls" style={{ display: 'flex', alignItems: 'center', gap: '14px', flexWrap: 'wrap' }}>
        {/* Service health & mode for desktop view */}
        <div className="masthead-status-desktop" style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div
            className="badge-status"
            data-testid="service-status"
            style={{
              backgroundColor: !isHealthKnown
                ? 'var(--paper-subtle)'
                : isServiceOk
                ? 'var(--sage-50)'
                : 'var(--clay-50)',
              color: !isHealthKnown
                ? 'var(--ink-secondary)'
                : isServiceOk
                ? 'var(--sage-700)'
                : 'var(--clay-700)',
              borderColor: !isHealthKnown
                ? 'var(--paper-border)'
                : isServiceOk
                ? 'var(--sage-200)'
                : 'var(--clay-200)',
            }}
            title={
              !isHealthKnown
                ? 'Connecting to service…'
                : isServiceOk
                ? 'Planning service online'
                : 'Planning service offline'
            }
          >
            <Database size={12} />
            {!isHealthKnown ? 'Checking service…' : isServiceOk ? 'Service online' : 'Service offline'}
          </div>

          <div
            className={`badge-status ${currentMode === 'live' ? 'live' : 'deterministic'}`}
            data-testid="check-mode"
            title={
              currentMode === 'live'
                ? 'AI-assisted plan analysis active'
                : 'Rules check: deterministic verification only'
            }
          >
            {currentMode === 'live' ? <Sparkles size={12} /> : <ShieldCheck size={12} />}
            {modeLabel}
          </div>
        </div>

        {/* Optional details: technical status (on mobile), revision number and optional AI explanation toggle */}
        <details className="pact-detail-toggle" data-testid="header-details">
          <summary>Plan details &amp; options</summary>
          <div className="pact-inline-note" style={{ marginTop: '10px', maxWidth: '320px' }}>
            {/* Secondary technical status on mobile */}
            <div className="masthead-status-mobile" style={{ marginBottom: '12px', paddingBottom: '10px', borderBottom: '1px solid var(--paper-border)' }}>
              <span className="editorial-label" style={{ fontSize: '0.68rem', display: 'block', marginBottom: '6px' }}>
                System status
              </span>
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                <div
                  className="badge-status"
                  style={{
                    backgroundColor: !isHealthKnown
                      ? 'var(--paper-subtle)'
                      : isServiceOk
                      ? 'var(--sage-50)'
                      : 'var(--clay-50)',
                    color: !isHealthKnown
                      ? 'var(--ink-secondary)'
                      : isServiceOk
                      ? 'var(--sage-700)'
                      : 'var(--clay-700)',
                    borderColor: !isHealthKnown
                      ? 'var(--paper-border)'
                      : isServiceOk
                      ? 'var(--sage-200)'
                      : 'var(--clay-200)',
                  }}
                >
                  <Database size={12} />
                  {!isHealthKnown ? 'Checking service…' : isServiceOk ? 'Service online' : 'Service offline'}
                </div>

                <div className={`badge-status ${currentMode === 'live' ? 'live' : 'deterministic'}`}>
                  {currentMode === 'live' ? <Sparkles size={12} /> : <ShieldCheck size={12} />}
                  {modeLabel}
                </div>
              </div>
            </div>

            <p style={{ fontSize: '0.8rem', color: 'var(--ink-secondary)', marginBottom: '10px' }}>
              Plan revision <strong>#{workspace?.revision ?? 0}</strong>. Revision numbers change when a plan is
              edited or approved.
            </p>

            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '10px',
                padding: '8px 10px',
                backgroundColor: 'var(--paper-subtle)',
                border: '1px solid var(--paper-border)',
                borderRadius: 'var(--radius-xs)',
              }}
              title={
                !isLiveCapable
                  ? 'AI explanation is unavailable: API key or runtime absent. The rules check still runs.'
                  : 'Use AI to explain the rules check in plain language'
              }
            >
              <label
                htmlFor="live-ai-switch"
                style={{
                  fontSize: '0.8rem',
                  fontWeight: 500,
                  color: isLiveCapable ? 'var(--ink-secondary)' : 'var(--ink-muted)',
                  cursor: isLiveCapable ? 'pointer' : 'not-allowed',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                }}
              >
                Use AI for explanations (optional)
                {!isLiveCapable && <HelpCircle size={12} style={{ color: 'var(--ink-muted)' }} />}
              </label>
              <label className="toggle-switch">
                <input
                  id="live-ai-switch"
                  data-testid="ai-assist-toggle"
                  type="checkbox"
                  checked={isLiveAiEnabled && isLiveCapable}
                  disabled={!isLiveCapable}
                  onChange={(e) => onToggleLiveAi(e.target.checked)}
                  aria-label="Use AI for explanations"
                />
                <span className="toggle-slider" />
              </label>
            </div>

            <p style={{ fontSize: '0.72rem', color: 'var(--ink-tertiary)', marginTop: '8px' }}>
              AI is only an explanation layer. The rules check always runs and never depends on it.
            </p>
          </div>
        </details>

        {/* Action: Start over / Reset */}
        <button
          type="button"
          onClick={onResetClick}
          className="btn-editorial-secondary masthead-start-over"
          data-testid="start-over"
          style={{ padding: '7px 12px', fontSize: '0.8rem' }}
          title="Start over with the sample studio plan"
        >
          <RotateCcw size={13} />
          Start over
        </button>

        {/* Action: Check this plan (the one main action) */}
        <button
          type="button"
          onClick={onAnalyze}
          disabled={isAnalyzing || !workspace}
          className="btn-editorial-primary pact-primary-action masthead-check-btn"
          data-testid="check-plan"
          style={{ padding: '7px 16px', fontSize: '0.82rem' }}
        >
          {isAnalyzing ? (
            <>
              <RefreshCw size={13} className="animate-spin" style={{ animation: 'spin 1s linear infinite' }} />
              Checking plan…
            </>
          ) : (
            <>
              <Play size={13} />
              Check this plan
            </>
          )}
        </button>
      </div>

      <style jsx>{`
        @keyframes spin {
          from {
            transform: rotate(0deg);
          }
          to {
            transform: rotate(360deg);
          }
        }
      `}</style>
    </header>
  );
}
