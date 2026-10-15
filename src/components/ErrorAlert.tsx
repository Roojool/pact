'use client';

import React from 'react';
import { AlertCircle, X, RefreshCw, RotateCcw, CheckCircle2 } from 'lucide-react';

interface ErrorAlertProps {
  error: { message: string; code?: string } | null;
  onDismiss: () => void;
  onRetry?: () => void;
  onReload?: () => void;
  onRecheck?: () => void;
}

export function ErrorAlert({ error, onDismiss, onRetry, onReload, onRecheck }: ErrorAlertProps) {
  if (!error) return null;

  const isStale409 =
    error.code === '409' ||
    error.code === 'REVISION_CONFLICT' ||
    /stale|conflict|revision/i.test(error.message);

  return (
    <div
      role="alert"
      data-testid="error-alert"
      data-error-code={error.code}
      className="paper-card mb-6 p-4 border-l-4"
      style={{
        borderLeftColor: 'var(--clay-600)',
        backgroundColor: 'var(--clay-50)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px', flex: 1, minWidth: '280px' }}>
          <AlertCircle
            size={18}
            style={{ color: 'var(--clay-700)', flexShrink: 0, marginTop: '2px' }}
            aria-hidden="true"
          />
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
              <span
                data-testid="error-alert-title"
                style={{ fontWeight: 600, color: 'var(--clay-800)', fontSize: '0.88rem' }}
                title={error.code ? `HTTP ${error.code}` : undefined}
              >
                {isStale409 ? 'The plan changed' : 'Something went wrong'}
              </span>
            </div>
            <p style={{ fontSize: '0.85rem', color: 'var(--clay-800)', lineHeight: '1.4' }}>
              {isStale409
                ? 'This plan changed since it was checked. Reload the latest plan or check it again to continue.'
                : error.message}
            </p>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
          {isStale409 && onReload && (
            <button
              type="button"
              onClick={onReload}
              className="btn-editorial-primary"
              style={{ padding: '4px 12px', fontSize: '0.75rem' }}
              aria-label="Reload plan"
            >
              <RotateCcw size={12} />
              Reload plan
            </button>
          )}
          {isStale409 && onRecheck && (
            <button
              type="button"
              onClick={onRecheck}
              className="btn-editorial-sage"
              style={{ padding: '4px 12px', fontSize: '0.75rem' }}
              aria-label="Recheck plan"
            >
              <CheckCircle2 size={12} />
              Recheck plan
            </button>
          )}
          {!isStale409 && onRetry && (
            <button
              type="button"
              onClick={onRetry}
              className="btn-editorial-secondary"
              style={{ padding: '4px 10px', fontSize: '0.75rem' }}
              aria-label="Retry operation"
            >
              <RefreshCw size={12} />
              Retry
            </button>
          )}
          <button
            type="button"
            onClick={onDismiss}
            style={{
              background: 'transparent',
              border: 'none',
              cursor: 'pointer',
              color: 'var(--clay-700)',
              padding: '4px',
              display: 'flex',
              alignItems: 'center',
            }}
            aria-label="Dismiss error"
          >
            <X size={16} />
          </button>
        </div>
      </div>
    </div>
  );
}
