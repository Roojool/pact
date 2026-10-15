'use client';

import React from 'react';
import {
  Layers,
  AlertTriangle,
  ArrowRightLeft,
  CheckCircle2,
  MessageSquare,
  FileText,
  Compass,
} from 'lucide-react';
import { Workspace, Analysis } from '@/lib/types';
import { VIEW_LABELS } from './ui-copy';

export type NavView = 'overview' | 'conflicts' | 'repairs' | 'receipts' | 'memory';

interface NavProps {
  currentView: NavView;
  onSelectView: (view: NavView) => void;
  workspace: Workspace | null;
  analysis: Analysis | null;
  onOpenSourceDrawer: () => void;
}

export function Nav({
  currentView,
  onSelectView,
  workspace,
  analysis,
  onOpenSourceDrawer,
}: NavProps) {
  const checkResult = analysis?.check ?? null;
  const conflictCount = checkResult?.conflictIds?.length ?? 0;
  const proposalCount = analysis?.proposals?.length ?? 0;
  const decisionCount = workspace?.decisions?.length ?? 0;
  const sourceCount = workspace?.sources?.length ?? 0;

  // Small-business navigation: What needs attention? What can we change?
  // Who approves it? Saved plan and optional AI explanation.
  const navItems: { id: NavView; label: string; icon: React.ReactNode; badge?: number; badgeColor?: string }[] = [
    {
      id: 'overview',
      label: VIEW_LABELS.overview,
      icon: <Layers size={16} />,
      badge: workspace?.commitments?.length,
    },
    {
      id: 'conflicts',
      label: VIEW_LABELS.conflicts,
      icon: <AlertTriangle size={16} />,
      badge: conflictCount,
      badgeColor: conflictCount > 0 ? 'var(--clay-600)' : undefined,
    },
    {
      id: 'repairs',
      label: VIEW_LABELS.repairs,
      icon: <ArrowRightLeft size={16} />,
      badge: proposalCount,
      badgeColor: proposalCount > 0 ? 'var(--sage-700)' : undefined,
    },
    {
      id: 'receipts',
      label: VIEW_LABELS.receipts,
      icon: <CheckCircle2 size={16} />,
      badge: decisionCount,
    },
    {
      id: 'memory',
      label: VIEW_LABELS.memory,
      icon: <MessageSquare size={16} />,
    },
  ];

  return (
    <nav className="pact-nav-rail" aria-label="Studio planning navigation" data-testid="nav-rail">
      {/* Studio Brand Mark */}
      <div className="pact-nav-brand">
        <div
          style={{
            width: '28px',
            height: '28px',
            backgroundColor: 'var(--ink-primary)',
            color: '#FFFFFF',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontFamily: 'var(--font-serif)',
            fontSize: '1rem',
            fontWeight: 700,
            borderRadius: 'var(--radius-xs)',
          }}
        >
          P
        </div>
        <div>
          <span style={{ fontWeight: 700, fontSize: '0.92rem', letterSpacing: '0.04em', display: 'block' }}>
            PACT
          </span>
          <span style={{ fontSize: '0.68rem', color: 'var(--ink-tertiary)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
            Planning Desk
          </span>
        </div>
      </div>

      {/* Navigation Links */}
      <div className="pact-nav-items">
        <div className="pact-nav-header-label">
          <span className="editorial-label" style={{ fontSize: '0.68rem' }}>
            Your planning desk
          </span>
        </div>

        {navItems.map((item) => {
          const isActive = currentView === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => {
                onSelectView(item.id);
                if (typeof window !== 'undefined') {
                  window.scrollTo(0, 0);
                }
              }}
              className={`nav-item-btn ${isActive ? 'active' : ''}`}
              aria-current={isActive ? 'page' : undefined}
              data-testid={`nav-${item.id}`}
              data-view={item.id}
            >
              <span style={{ color: isActive ? 'var(--clay-700)' : 'var(--ink-tertiary)', display: 'inline-flex' }}>
                {item.icon}
              </span>
              <span style={{ flex: 1, whiteSpace: 'nowrap' }}>{item.label}</span>
              {typeof item.badge === 'number' && item.badge > 0 && (
                <span
                  className="font-mono"
                  style={{
                    fontSize: '0.68rem',
                    padding: '1px 6px',
                    borderRadius: '10px',
                    backgroundColor: item.badgeColor ? 'var(--clay-100)' : 'var(--paper-subtle)',
                    color: item.badgeColor || 'var(--ink-secondary)',
                    fontWeight: 600,
                  }}
                >
                  {item.badge}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Grounding / Source Drawer Launcher */}
      <div className="pact-nav-footer">
        <button
          type="button"
          onClick={onOpenSourceDrawer}
          className="btn-editorial-secondary"
          data-testid="open-sources"
          style={{
            width: '100%',
            justifyContent: 'flex-start',
            fontSize: '0.78rem',
            padding: '8px 12px',
            whiteSpace: 'nowrap',
          }}
        >
          <FileText size={14} style={{ color: 'var(--clay-700)', flexShrink: 0 }} />
          <span>Sources</span>
          <span
            className="font-mono"
            style={{
              marginLeft: 'auto',
              fontSize: '0.68rem',
              backgroundColor: 'var(--paper-inset)',
              padding: '1px 5px',
              borderRadius: 'var(--radius-xs)',
            }}
          >
            {sourceCount}
          </span>
        </button>

        <div className="pact-nav-footer-sub" style={{ marginTop: '10px', padding: '0 4px', display: 'flex', alignItems: 'center', gap: '6px' }}>
          <Compass size={11} style={{ color: 'var(--ink-tertiary)' }} />
          <span style={{ fontSize: '0.68rem', color: 'var(--ink-tertiary)' }}>
            Sample agency: Morrow Studio
          </span>
        </div>
      </div>

      <style jsx>{`
        .pact-nav-brand {
          padding: 24px 20px 16px 20px;
          border-bottom: 1px solid var(--paper-border);
          display: flex;
          align-items: center;
          gap: 10px;
        }
        .pact-nav-items {
          flex: 1;
          padding: 16px 0;
          display: flex;
          flex-direction: column;
          gap: 2px;
        }
        .pact-nav-header-label {
          padding: 0 16px 8px 16px;
        }
        .pact-nav-footer {
          padding: 16px;
          border-top: 1px solid var(--paper-border);
          background-color: #FAF7EE;
        }
        @media (max-width: 900px) {
          .pact-nav-brand {
            padding: 8px 12px;
            border-bottom: 1px solid var(--paper-border);
            border-right: none;
            display: flex;
            align-items: center;
          }
          .pact-nav-items {
            flex-direction: row;
            align-items: center;
            padding: 4px 8px;
            overflow-x: auto;
            -webkit-overflow-scrolling: touch;
            width: 100%;
            min-width: 0;
            box-sizing: border-box;
            gap: 4px;
            scrollbar-width: thin;
          }
          .pact-nav-header-label {
            display: none;
          }
          .pact-nav-footer {
            padding: 6px 12px;
            border-top: none;
            border-bottom: 1px solid var(--paper-border);
            border-left: none;
            display: flex;
            align-items: center;
            background: transparent;
          }
          .pact-nav-footer-sub {
            display: none !important;
          }
        }
      `}</style>
    </nav>
  );
}
