'use client';

import React, { useRef, useEffect } from 'react';
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
  const detailsRef = useRef<HTMLDetailsElement>(null);
  const summaryRef = useRef<HTMLElement>(null);

  const isLiveCapable = Boolean(health?.liveAvailable || health?.liveAiAvailable);

  // Do not infer healthy on an unknown state.
  const isHealthKnown = health !== null && typeof health === 'object';
  const isServiceOk = isHealthKnown && Boolean(health.graphConnected ?? health.ok ?? health.database);

  // Truthful mode wording: never imply an AI call happened in rules mode.
  const currentMode = analysis?.mode ?? 'deterministic';
  const modeLabel = currentMode === 'live' ? 'AI-assisted check' : 'Rules check';

  // Keyboard accessibility & click-outside dismissal for settings popover
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape' && detailsRef.current?.open) {
        detailsRef.current.open = false;
        summaryRef.current?.focus();
      }
    }

    function handleClickOutside(e: MouseEvent) {
      if (detailsRef.current?.open && !detailsRef.current.contains(e.target as Node)) {
        detailsRef.current.open = false;
      }
    }

    document.addEventListener('keydown', handleKeyDown);
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  return (
    <header className="pact-masthead" data-testid="masthead">
      {/* Masthead Left: Golden Hour brand identity + studio label */}
      <div className="masthead-identity">
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <svg className="masthead-flower" width="38" height="38" viewBox="0 0 100 100" aria-hidden="true">{workspace?.businessType === 'food_shop' ? <><path d="M12 43C15 12 85 12 88 43Z" fill="#efae24" stroke="#8b251a" strokeWidth="4"/><path d="M10 52H90M12 67H88" stroke="#8b251a" strokeWidth="12" strokeLinecap="round"/><path d="M14 57L36 64 53 56 73 64 88 57" fill="none" stroke="#567638" strokeWidth="5"/><path d="M12 76H88Q85 91 72 91H28Q15 91 12 76Z" fill="#efae24" stroke="#8b251a" strokeWidth="4"/></> : <use href="#sf" />}</svg>
          <div>
            <div className="masthead-brand-line" style={{ display: 'flex', alignItems: 'baseline', gap: '8px', lineHeight: 1 }}>
              <span className="d" style={{ fontSize: '1.9rem', color: 'var(--ink)' }}>
                PACT
              </span>
              <span className="mono masthead-company" title={workspace?.agency} style={{ fontSize: '0.68rem', color: 'var(--muted)', letterSpacing: '0.12em' }}>
                {workspace?.agency ?? 'Your business'}
              </span>
            </div>
            <h1 className="editorial-headline" style={{ fontSize: '0.88rem', marginTop: '1px', color: 'var(--ink-secondary)', fontWeight: 500 }}>
              Your work plan
            </h1>
          </div>
        </div>
      </div>

      {/* Masthead Right: status, contained settings popover, start-over, and Check this plan */}
      <div className="masthead-controls">
        {/* Desktop Service Health & Mode Indicators */}
        <div className="masthead-status-desktop">
          <div
            className="badge-status"
            data-testid="service-status"
            style={{
              backgroundColor: !isHealthKnown
                ? 'var(--paper-subtle)'
                : isServiceOk
                ? 'var(--forest-light)'
                : 'var(--orange-light)',
              color: !isHealthKnown
                ? 'var(--ink-secondary)'
                : isServiceOk
                ? 'var(--forest-base)'
                : 'var(--orange-text)',
              borderColor: !isHealthKnown
                ? 'var(--paper-border)'
                : isServiceOk
                ? 'var(--forest-border)'
                : 'var(--orange-border)',
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

        {/* Dedicated Contained Popover for 'Plan details & options'
            Bug fix: Opening this NEVER displaces the flex row actions or squeezes the title */}
        <details ref={detailsRef} className="pact-detail-toggle" data-testid="header-details">
          <summary ref={summaryRef}>Plan details &amp; options</summary>
          <div className="pact-detail-popover">
            {/* Secondary technical status on mobile */}
            <div
              className="masthead-status-mobile"
              style={{
                marginBottom: '12px',
                paddingBottom: '10px',
                borderBottom: '1px solid var(--paper-border)',
              }}
            >
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
                      ? 'var(--forest-light)'
                      : 'var(--orange-light)',
                    color: !isHealthKnown
                      ? 'var(--ink-secondary)'
                      : isServiceOk
                      ? 'var(--forest-base)'
                      : 'var(--orange-text)',
                    borderColor: !isHealthKnown
                      ? 'var(--paper-border)'
                      : isServiceOk
                      ? 'var(--forest-border)'
                      : 'var(--orange-border)',
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

            <p style={{ fontSize: '0.82rem', color: 'var(--ink-secondary)', marginBottom: '10px' }}>
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
