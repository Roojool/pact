'use client';

import React, { useEffect, useState, useRef } from 'react';
import { Source } from '@/lib/types';
import { X, FileText, ShieldAlert, Calendar, ArrowRightLeft, Search, Layers } from 'lucide-react';
import { sourceKindLabel } from './ui-copy';

interface SourceDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  sources: Source[];
  activeSourceId: string | null;
  onSelectSource: (sourceId: string) => void;
}

export function SourceDrawer({
  isOpen,
  onClose,
  sources,
  activeSourceId,
  onSelectSource,
}: SourceDrawerProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [filterKind, setFilterKind] = useState<string>('all');
  const panelRef = useRef<HTMLDivElement>(null);
  const previousActiveElement = useRef<HTMLElement | null>(null);

  // Focus entering, returning, focus trap, and Escape closing
  useEffect(() => {
    if (!isOpen) return;
    previousActiveElement.current = document.activeElement as HTMLElement | null;

    const timer = setTimeout(() => {
      const panel = panelRef.current;
      if (!panel) return;
      const searchInput = panel.querySelector<HTMLInputElement>('input[type="text"]');
      if (searchInput) {
        searchInput.focus();
      } else {
        panel.focus();
      }
    }, 20);

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
        return;
      }
      if (e.key === 'Tab' && panelRef.current) {
        const focusables = Array.from(
          panelRef.current.querySelectorAll<HTMLElement>(
            'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
          )
        ).filter((el) => el.offsetParent !== null);

        if (focusables.length === 0) return;
        const first = focusables[0];
        const last = focusables[focusables.length - 1];

        if (e.shiftKey) {
          if (document.activeElement === first) {
            e.preventDefault();
            last.focus();
          }
        } else {
          if (document.activeElement === last) {
            e.preventDefault();
            first.focus();
          }
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      clearTimeout(timer);
      window.removeEventListener('keydown', handleKeyDown);
      if (previousActiveElement.current && typeof previousActiveElement.current.focus === 'function') {
        previousActiveElement.current.focus();
      }
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const filteredSources = sources.filter((s) => {
    const matchesKind = filterKind === 'all' || s.kind === filterKind;
    const matchesSearch =
      s.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      s.excerpt.toLowerCase().includes(searchQuery.toLowerCase()) ||
      s.id.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesKind && matchesSearch;
  });

  // STRICT REQUIREMENT 5: Source links must open actual source or all-source view if unknown.
  // If activeSourceId is provided and exists in sources, display it; otherwise, null (all-source view).
  const selectedSource = activeSourceId
    ? sources.find((s) => s.id === activeSourceId) || null
    : null;

  const getKindIcon = (kind: Source['kind']) => {
    switch (kind) {
      case 'brief':
        return <FileText size={14} style={{ color: 'var(--ink-secondary)' }} />;
      case 'policy':
        return <ShieldAlert size={14} style={{ color: 'var(--clay-600)' }} />;
      case 'calendar':
        return <Calendar size={14} style={{ color: 'var(--sand-700)' }} />;
      case 'handoff':
        return <ArrowRightLeft size={14} style={{ color: 'var(--sage-600)' }} />;
      default:
        return <FileText size={14} />;
    }
  };

  return (
    <div
      className="source-drawer-backdrop"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Sources: briefs, client approvals, working hours and handoff notes"
      data-testid="source-drawer"
    >
      <div
        ref={panelRef}
        className="source-drawer-panel"
        onClick={(e) => e.stopPropagation()}
        tabIndex={-1}
      >
        {/* Drawer Header */}
        <div
          style={{
            padding: '20px 24px',
            borderBottom: '1px solid var(--paper-border-strong)',
            backgroundColor: 'var(--paper-surface)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <div>
            <span className="editorial-label" style={{ color: 'var(--clay-700)' }}>
              The records behind this plan
            </span>
            <h2 className="editorial-headline" style={{ fontSize: '1.25rem', marginTop: '2px' }}>
              Sources
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="btn-editorial-secondary"
            style={{ padding: '6px', borderRadius: '50%' }}
            aria-label="Close drawer"
          >
            <X size={16} />
          </button>
        </div>

        {/* Search & Filter Toolbar */}
        <div
          style={{
            padding: '14px 24px',
            borderBottom: '1px solid var(--paper-border)',
            backgroundColor: 'var(--paper-subtle)',
            display: 'flex',
            flexDirection: 'column',
            gap: '10px',
          }}
        >
          <div style={{ position: 'relative' }}>
            <Search
              size={14}
              style={{
                position: 'absolute',
                left: '10px',
                top: '50%',
                transform: 'translateY(-50%)',
                color: 'var(--ink-tertiary)',
              }}
            />
            <input
              type="text"
              placeholder="Search briefs, approvals and notes…"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="editorial-input"
              style={{ paddingLeft: '32px', fontSize: '0.82rem' }}
              aria-label="Search sources"
            />
          </div>

          <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
            {[
              { key: 'all', label: 'All sources' },
              { key: 'brief', label: 'Campaign brief' },
              { key: 'policy', label: 'Client approvals' },
              { key: 'calendar', label: 'Working hours' },
              { key: 'handoff', label: 'Handoff notes' },
            ].map(({ key, label }) => (
              <button
                key={key}
                type="button"
                onClick={() => setFilterKind(key)}
                className={`badge-status ${filterKind === key ? 'deterministic' : 'neutral'}`}
                data-testid={`source-filter-${key}`}
                style={{
                  cursor: 'pointer',
                  border: filterKind === key ? '1px solid var(--ink-primary)' : '1px solid var(--paper-border)',
                  backgroundColor: filterKind === key ? 'var(--ink-primary)' : 'var(--paper-surface)',
                  color: filterKind === key ? '#FFFFFF' : 'var(--ink-secondary)',
                  padding: '3px 8px',
                }}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* Source List & Detail */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflowY: 'auto' }}>
          {/* Selected Source Reader or All-Source View if Unknown */}
          {selectedSource ? (
            <div
              style={{
                padding: '24px',
                borderBottom: '2px solid var(--paper-border-strong)',
                backgroundColor: 'var(--paper-surface)',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                <span className={`badge-status ${selectedSource.kind === 'policy' ? 'infeasible' : 'neutral'}`}>
                  {getKindIcon(selectedSource.kind)}
                  {sourceKindLabel(selectedSource.kind)}
                </span>
              </div>

              <h3 className="editorial-headline" style={{ fontSize: '1.15rem', marginBottom: '10px' }}>
                {selectedSource.title}
              </h3>

              <div
                style={{
                  backgroundColor: 'var(--paper-subtle)',
                  border: '1px solid var(--paper-border)',
                  borderLeft: '3px solid var(--clay-600)',
                  padding: '16px',
                  borderRadius: 'var(--radius-xs)',
                  fontFamily: 'var(--font-serif)',
                  fontSize: '0.95rem',
                  lineHeight: '1.6',
                  color: 'var(--ink-primary)',
                  whiteSpace: 'pre-wrap',
                }}
              >
                {selectedSource.excerpt}
              </div>

              <details className="pact-detail-toggle" data-testid="source-technical-details" style={{ marginTop: '14px' }}>
                <summary>Technical details</summary>
                <div style={{ marginTop: '10px', fontSize: '0.75rem', color: 'var(--ink-tertiary)', fontFamily: 'var(--font-mono)', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <span>ID: {selectedSource.id}</span>
                  <span>Revision: r{selectedSource.revision}</span>
                  <span>
                    Recorded:{' '}
                    {new Date(selectedSource.updatedAt).toLocaleString(undefined, {
                      month: 'short',
                      day: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </span>
                </div>
              </details>
            </div>
          ) : (
            /* All-source view when active source is unknown / not specified */
            <div
              style={{
                padding: '20px 24px',
                borderBottom: '1px solid var(--paper-border)',
                backgroundColor: 'var(--paper-surface)',
                display: 'flex',
                alignItems: 'center',
                gap: '12px',
              }}
            >
              <div
                style={{
                  width: '36px',
                  height: '36px',
                  borderRadius: 'var(--radius-xs)',
                  backgroundColor: 'var(--paper-subtle)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: 'var(--ink-secondary)',
                }}
              >
                <Layers size={18} />
              </div>
              <div>
                <h4 style={{ fontSize: '0.92rem', fontWeight: 600 }}>All sources</h4>
                <p style={{ fontSize: '0.78rem', color: 'var(--ink-secondary)' }}>
                  Pick any record to read its short excerpt. Revision and id details are kept under Technical details.
                </p>
              </div>
            </div>
          )}

          {/* Source Document Directory */}
          <div style={{ padding: '18px 24px' }}>
            <span className="editorial-subhead" style={{ display: 'block', marginBottom: '12px', fontSize: '0.75rem' }}>
              Records ({filteredSources.length})
            </span>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {filteredSources.map((source) => {
                const isSelected = selectedSource?.id === source.id;
                return (
                  <button
                    key={source.id}
                    type="button"
                    onClick={() => onSelectSource(source.id)}
                    data-testid={`source-item-${source.id}`}
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      textAlign: 'left',
                      padding: '12px 14px',
                      backgroundColor: isSelected ? 'var(--paper-surface)' : 'transparent',
                      border: isSelected ? '1px solid var(--clay-600)' : '1px solid var(--paper-border)',
                      borderRadius: 'var(--radius-xs)',
                      cursor: 'pointer',
                      transition: 'all 0.15s ease',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '4px', gap: '8px' }}>
                      <span style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.82rem', fontWeight: 600 }}>
                        {getKindIcon(source.kind)}
                        {source.title}
                      </span>
                      <span style={{ fontSize: '0.68rem', color: 'var(--ink-tertiary)', whiteSpace: 'nowrap' }}>
                        {sourceKindLabel(source.kind)}
                      </span>
                    </div>
                    <p
                      style={{
                        fontSize: '0.75rem',
                        color: 'var(--ink-secondary)',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {source.excerpt}
                    </p>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Drawer Footer */}
        <div
          style={{
            padding: '14px 24px',
            borderTop: '1px solid var(--paper-border)',
            backgroundColor: 'var(--paper-subtle)',
            fontSize: '0.75rem',
            color: 'var(--ink-tertiary)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <span>Studio records</span>
          <span>{sources.length} sources</span>
        </div>
      </div>
    </div>
  );
}
