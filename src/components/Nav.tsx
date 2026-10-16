'use client';

import React from 'react';
import {
  Layers,
  AlertTriangle,
  ArrowRightLeft,
  CheckCircle2,
  MessageSquare,
  FileText,
  LayoutDashboard,
} from 'lucide-react';
import { Workspace, Analysis } from '@/lib/types';
import { VIEW_LABELS } from './ui-copy';

export type NavView = 'dashboard' | 'overview' | 'conflicts' | 'repairs' | 'receipts' | 'memory';

interface NavProps {
  currentView: NavView;
  onSelectView: (view: NavView) => void;
  workspace: Workspace | null;
  analysis: Analysis | null;
  onOpenSourceDrawer: () => void;
}

/**
 * Small code-native sunflower / horizon anchor:
 * Warm ochre/orange disc, olive/forest green horizon curve, cream space.
 * aria-hidden="true" decorative anchor.
 */
function SunflowerHorizonIcon() {
  return (
    <svg
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      style={{ flexShrink: 0 }}
    >
      {/* Warm ochre sun disc */}
      <circle cx="12" cy="14" r="8" fill="var(--sunflower-base)" />
      {/* Orange horizon glow arc */}
      <path
        d="M3 15C6.5 13.5 17.5 13.5 21 15"
        stroke="var(--orange-base)"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
      {/* Olive/Forest horizon ground */}
      <path
        d="M2 17C6 15 18 15 22 17V22H2V17Z"
        fill="var(--forest-base)"
      />
      {/* Small subtle petal accent */}
      <path
        d="M12 4C12.6 6.5 13 8 12 9.5C11 8 11.4 6.5 12 4Z"
        fill="var(--orange-base)"
      />
    </svg>
  );
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

  const navItems: { id: NavView; label: string; icon: React.ReactNode; badge?: number; badgeColor?: string }[] = [
    { id: 'dashboard', label: VIEW_LABELS.dashboard, icon: <LayoutDashboard size={15} /> },
    {
      id: 'overview',
      label: VIEW_LABELS.overview,
      icon: <Layers size={15} />,
      badge: workspace?.commitments?.length,
    },
    {
      id: 'conflicts',
      label: VIEW_LABELS.conflicts,
      icon: <AlertTriangle size={15} />,
      badge: conflictCount,
      badgeColor: conflictCount > 0 ? 'var(--orange-base)' : undefined,
    },
    {
      id: 'repairs',
      label: VIEW_LABELS.repairs,
      icon: <ArrowRightLeft size={15} />,
      badge: proposalCount,
      badgeColor: proposalCount > 0 ? 'var(--forest-base)' : undefined,
    },
    {
      id: 'receipts',
      label: VIEW_LABELS.receipts,
      icon: <CheckCircle2 size={15} />,
      badge: decisionCount,
    },
    {
      id: 'memory',
      label: VIEW_LABELS.memory,
      icon: <MessageSquare size={15} />,
    },
  ];

  return (
    <nav className="pact-nav-rail" aria-label="Studio planning navigation" data-testid="nav-rail">
      {/* Studio Brand Mark with Sunflower / Horizon Anchor */}
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
            fontSize: '0.98rem',
            fontWeight: 700,
            borderRadius: 'var(--radius-xs)',
            flexShrink: 0,
          }}
        >
          P
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.15 }}>
          <span
            style={{
              fontWeight: 800,
              fontSize: '0.92rem',
              letterSpacing: '0.06em',
              color: 'var(--ink-primary)',
            }}
          >
            PACT
          </span>
          <span
            style={{
              fontSize: '0.62rem',
              color: 'var(--ink-tertiary)',
              textTransform: 'uppercase',
              letterSpacing: '0.08em',
              fontWeight: 600,
            }}
          >
            Planning Desk
          </span>
        </div>
        <SunflowerHorizonIcon />
      </div>

      {/* Horizontal Navigation Links */}
      <div className="pact-nav-items">
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
              <span
                style={{
                  color: isActive ? 'var(--ink)' : 'var(--ink-secondary)',
                  display: 'inline-flex',
                }}
              >
                {item.icon}
              </span>
              <span>{item.label}</span>
              {typeof item.badge === 'number' && item.badge > 0 && (
                <b
                  className="nav-count-badge"
                  style={{
                    backgroundColor: item.badgeColor ?? 'var(--ink)',
                    color: '#FFFFFF',
                  }}
                >
                  {item.badge}
                </b>
              )}
            </button>
          );
        })}
      </div>

      {/* Sources Launcher */}
      <div className="pact-nav-footer">
        <button
          type="button"
          onClick={onOpenSourceDrawer}
          className="btn-editorial-secondary"
          data-testid="open-sources"
          style={{
            fontSize: '0.78rem',
            padding: '6px 12px',
            minHeight: '36px',
          }}
        >
          <FileText size={13} style={{ color: 'var(--forest-base)', flexShrink: 0 }} />
          <span>Sources</span>
          <span
            className="font-mono"
            style={{
              marginLeft: '4px',
              fontSize: '0.68rem',
              backgroundColor: 'var(--paper-subtle)',
              border: '1px solid var(--paper-border)',
              padding: '1px 6px',
              borderRadius: 'var(--radius-xs)',
              fontWeight: 600,
            }}
          >
            {sourceCount}
          </span>
        </button>
      </div>
    </nav>
  );
}
