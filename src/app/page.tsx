'use client';

import React, { useState, useEffect, useCallback } from 'react';
import {
  Workspace,
  Analysis,
  AgentReply,
  WorkspaceEdit,
} from '@/lib/types';
import { Header } from '@/components/Header';
import { Nav, NavView } from '@/components/Nav';
import { HeroBottleneckCard } from '@/components/HeroBottleneckCard';
import { OverviewView } from '@/components/OverviewView';
import { ConflictEvidenceView } from '@/components/ConflictEvidenceView';
import { RepairComparisonView } from '@/components/RepairComparisonView';
import { SavedReceiptsView } from '@/components/SavedReceiptsView';
import { StudioMemoryView } from '@/components/StudioMemoryView';
import { SourceDrawer } from '@/components/SourceDrawer';
import { ResetModal } from '@/components/EditModals';
import { ErrorAlert } from '@/components/ErrorAlert';
import { SkeletonLoader } from '@/components/SkeletonLoader';
import { RefreshCw, Compass } from 'lucide-react';

export default function PlanningDeskPage() {
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [health, setHealth] = useState<{
    ok?: boolean;
    liveAvailable?: boolean;
    graphConnected?: boolean;
    database?: boolean;
    [key: string]: unknown;
  } | null>(null);

  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isAnalyzing, setIsAnalyzing] = useState<boolean>(false);
  const [isApproving, setIsApproving] = useState<boolean>(false);
  const [isSendingMemory, setIsSendingMemory] = useState<boolean>(false);
  const [error, setError] = useState<{ message: string; code?: string } | null>(null);

  const [currentView, setCurrentView] = useState<NavView>('overview');
  const [isLiveAiEnabled, setIsLiveAiEnabled] = useState<boolean>(false);

  // Source drawer state
  const [isSourceDrawerOpen, setIsSourceDrawerOpen] = useState<boolean>(false);
  const [activeSourceId, setActiveSourceId] = useState<string | null>(null);

  // Reset modal state
  const [isResetModalOpen, setIsResetModalOpen] = useState<boolean>(false);

  // Memory replies history
  const [memoryReplies, setMemoryReplies] = useState<AgentReply[]>([]);

  // 1. Fetch Health (Do not infer healthy on unknown state)
  const fetchHealth = useCallback(async () => {
    try {
      const res = await fetch('/api/health');
      if (res.ok) {
        const data = await res.json();
        setHealth(data);
        if (!data.liveAvailable && !data.liveAiAvailable) {
          setIsLiveAiEnabled(false);
        }
      } else {
        setHealth({ ok: false, graphConnected: false, database: false, liveAvailable: false });
        setIsLiveAiEnabled(false);
      }
    } catch {
      setHealth({ ok: false, graphConnected: false, database: false, liveAvailable: false });
      setIsLiveAiEnabled(false);
    }
  }, []);

  // 2. Fetch Workspace (Clears analysis on reload per contract)
  const fetchWorkspace = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    setAnalysis(null);
    try {
      const res = await fetch('/api/workspace');
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw {
          message: errData.error || 'The planning service is unavailable. Try again.',
          code: String(res.status),
        };
      }
      const data = await res.json();
      setWorkspace(data.workspace);
    } catch (err: unknown) {
      const typedErr = err as { message?: string; code?: string };
      setError({
        message: typedErr.message || 'The planning service is unavailable. Try again.',
        code: typedErr.code || 'SERVICE_UNAVAILABLE',
      });
      setWorkspace(null);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchHealth();
    fetchWorkspace();
  }, [fetchHealth, fetchWorkspace]);

  // 3. Check Plan (Rules check or AI-assisted check)
  const handleAnalyze = async () => {
    if (!workspace || isAnalyzing) return;
    setIsAnalyzing(true);
    setError(null);
    try {
      const isLiveCandidate = isLiveAiEnabled && Boolean(health?.liveAvailable || health?.liveAiAvailable);
      const res = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          revision: workspace.revision,
          live: isLiveCandidate,
        }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw {
          message: errData.error || 'The planning service is unavailable. Try again.',
          code: String(res.status),
        };
      }

      const data = await res.json();
      setWorkspace(data.workspace);
      setAnalysis(data.analysis);
    } catch (err: unknown) {
      const typedErr = err as { message?: string; code?: string };
      setError({
        message: typedErr.message || 'The planning service is unavailable. Try again.',
        code: typedErr.code || 'CHECK_ERROR',
      });
    } finally {
      setIsAnalyzing(false);
    }
  };

  // 4. Edit Workspace (PATCH)
  // After edits, invalidate analysis per Requirement 1
  const handleEditWorkspace = async (edit: WorkspaceEdit) => {
    if (!workspace) return;
    setError(null);
    try {
      const res = await fetch('/api/workspace', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          revision: workspace.revision,
          edit,
        }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw {
          message: errData.error || 'The planning service is unavailable. Try again.',
          code: String(res.status),
        };
      }

      const data = await res.json();
      setWorkspace(data.workspace);

      // STRICT REQUIREMENT 1: Invalidate analysis after edits
      setAnalysis(null);
    } catch (err: unknown) {
      const typedErr = err as { message?: string; code?: string };
      setError({
        message: typedErr.message || 'The planning service is unavailable. Try again.',
        code: typedErr.code || 'EDIT_ERROR',
      });
      throw err;
    }
  };

  // 5. Approve Proposal
  // After approval, invalidate analysis per Requirement 1
  const handleApproveProposal = async (proposalId: string) => {
    if (!workspace || isApproving) return;
    setIsApproving(true);
    setError(null);
    try {
      const idempotencyKey =
        typeof crypto !== 'undefined' && crypto.randomUUID
          ? crypto.randomUUID()
          : `idemp_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;

      const res = await fetch('/api/approve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          revision: workspace.revision,
          proposalId,
          idempotencyKey,
        }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw {
          message: errData.error || 'The planning service is unavailable. Try again.',
          code: String(res.status),
        };
      }

      const data = await res.json();
      setWorkspace(data.workspace);

      // STRICT REQUIREMENT 1: Invalidate analysis after approval
      setAnalysis(null);
      setCurrentView('receipts');
    } catch (err: unknown) {
      const typedErr = err as { message?: string; code?: string };
      setError({
        message: typedErr.message || 'The planning service is unavailable. Try again.',
        code: typedErr.code || 'APPROVE_ERROR',
      });
    } finally {
      setIsApproving(false);
    }
  };

  // 6. Start Over / Reset Workspace
  // Invalidate analysis and clear session replies
  const handleResetWorkspace = async () => {
    setError(null);
    try {
      const res = await fetch('/api/reset', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw {
          message: errData.error || 'The planning service is unavailable. Try again.',
          code: String(res.status),
        };
      }

      const data = await res.json();
      setWorkspace(data.workspace);
      setAnalysis(null);
      setMemoryReplies([]);
    } catch (err: unknown) {
      const typedErr = err as { message?: string; code?: string };
      setError({
        message: typedErr.message || 'The planning service is unavailable. Try again.',
        code: typedErr.code || 'RESET_ERROR',
      });
    }
  };

  // 7. Send Memory Message
  const handleSendMemoryMessage = async (message: string) => {
    if (isSendingMemory) return;
    setIsSendingMemory(true);
    setError(null);
    try {
      const isLiveCandidate = isLiveAiEnabled && Boolean(health?.liveAvailable || health?.liveAiAvailable);
      const res = await fetch('/api/memory', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message,
          live: isLiveCandidate,
        }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw {
          message: errData.error || 'The planning service is unavailable. Try again.',
          code: String(res.status),
        };
      }

      const data = await res.json();
      setMemoryReplies((prev) => [data.reply, ...prev]);
      if (data.workspace) {
        setWorkspace(data.workspace);
      }
    } catch (err: unknown) {
      const typedErr = err as { message?: string; code?: string };
      setError({
        message: typedErr.message || 'The planning service is unavailable. Try again.',
        code: typedErr.code || 'MEMORY_ERROR',
      });
    } finally {
      setIsSendingMemory(false);
    }
  };

  // STRICT REQUIREMENT 5: Source links must open actual source or all-source view if unknown.
  const handleOpenSourceDrawer = (sourceId?: string) => {
    if (sourceId && workspace?.sources?.some((s) => s.id === sourceId)) {
      setActiveSourceId(sourceId);
    } else {
      setActiveSourceId(null);
    }
    setIsSourceDrawerOpen(true);
  };

  return (
    <div className="pact-app-layout">
      {/* Left Navigation Rail */}
      <Nav
        currentView={currentView}
        onSelectView={setCurrentView}
        workspace={workspace}
        analysis={analysis}
        onOpenSourceDrawer={() => handleOpenSourceDrawer()}
      />

      {/* Main Planning Stage */}
      <div className="pact-main-stage">
        <Header
          workspace={workspace}
          analysis={analysis}
          health={health}
          isLiveAiEnabled={isLiveAiEnabled}
          onToggleLiveAi={setIsLiveAiEnabled}
          onAnalyze={handleAnalyze}
          onResetClick={() => setIsResetModalOpen(true)}
          isAnalyzing={isAnalyzing}
        />

        <main className="pact-content-container" data-testid="main-stage" data-view={currentView}>
          {/* Visible Error Banner: Preserved while controls recover */}
          <ErrorAlert
            error={error}
            onDismiss={() => setError(null)}
            onRetry={fetchWorkspace}
            onReload={fetchWorkspace}
            onRecheck={handleAnalyze}
          />

          {/* Loading Skeleton */}
          {isLoading ? (
            <SkeletonLoader />
          ) : !workspace ? (
            /* STRICT REQUIREMENT 3: Error state 'The planning service is unavailable. Try again.'
               not discussion of missing route handlers. */
            <div className="paper-card pact-empty-state" data-testid="workspace-empty" style={{ padding: '48px 36px', textAlign: 'center', maxWidth: '640px', margin: '40px auto' }}>
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
                <Compass size={24} />
              </div>

              <span className="editorial-label" style={{ color: 'var(--clay-700)', display: 'block', marginBottom: '4px' }}>
                Your studio plan
              </span>
              <h2 className="editorial-headline" style={{ fontSize: '1.5rem', marginBottom: '12px' }}>
                The planning service is unavailable. Try again.
              </h2>
              <p style={{ fontSize: '0.9rem', color: 'var(--ink-secondary)', lineHeight: '1.5', marginBottom: '24px' }}>
                Please check your connection or retry to load the sample agency plan.
              </p>

              <button
                type="button"
                onClick={fetchWorkspace}
                className="btn-editorial-primary"
                style={{ padding: '8px 20px' }}
              >
                <RefreshCw size={14} />
                <span>Try again</span>
              </button>
            </div>
          ) : (
            <>
              {/* First-use explainer: one short intro on the default screen */}
              {currentView === 'overview' && (
                <div className="pact-page-intro" data-testid="page-intro" style={{ marginBottom: '14px' }}>
                  <p>
                    PACT checks your studio plan against the briefs, working hours and client approvals before you
                    commit. Start with what needs attention, then pick a plan option and approve it — nothing changes
                    without you.
                  </p>
                </div>
              )}

              {/* Hero Callout: Always visible on Overview */}
              {currentView === 'overview' && (
                <HeroBottleneckCard
                  workspace={workspace}
                  analysis={analysis}
                  onNavigateToConflicts={() => setCurrentView('conflicts')}
                  onNavigateToRepairs={() => setCurrentView('repairs')}
                  onOpenSourceDrawer={handleOpenSourceDrawer}
                  onCheckPlan={handleAnalyze}
                  isChecking={isAnalyzing}
                />
              )}

              {/* View Router */}
              {currentView === 'overview' && (
                <OverviewView
                  workspace={workspace}
                  analysis={analysis}
                  onEditWorkspace={handleEditWorkspace}
                  onOpenSourceDrawer={handleOpenSourceDrawer}
                />
              )}

              {currentView === 'conflicts' && (
                <ConflictEvidenceView
                  workspace={workspace}
                  analysis={analysis}
                  onOpenSourceDrawer={handleOpenSourceDrawer}
                  onNavigateToRepairs={() => setCurrentView('repairs')}
                  onCheckPlan={handleAnalyze}
                  isChecking={isAnalyzing}
                />
              )}

              {currentView === 'repairs' && (
                <RepairComparisonView
                  workspace={workspace}
                  analysis={analysis}
                  onApproveProposal={handleApproveProposal}
                  onOpenSourceDrawer={handleOpenSourceDrawer}
                  isApproving={isApproving}
                  onCheckPlan={handleAnalyze}
                  isChecking={isAnalyzing}
                />
              )}

              {currentView === 'receipts' && (
                <SavedReceiptsView
                  workspace={workspace}
                  onOpenSourceDrawer={handleOpenSourceDrawer}
                  onNavigateToOverview={() => setCurrentView('overview')}
                />
              )}

              {currentView === 'memory' && (
                <StudioMemoryView
                  workspace={workspace}
                  replies={memoryReplies}
                  onSendMessage={handleSendMemoryMessage}
                  onOpenSourceDrawer={handleOpenSourceDrawer}
                  isSending={isSendingMemory}
                  isLiveAiEnabled={isLiveAiEnabled}
                  isLiveCapable={Boolean(health?.liveAvailable || health?.liveAiAvailable)}
                />
              )}
            </>
          )}
        </main>
      </div>

      {/* Source Evidence Drawer */}
      <SourceDrawer
        isOpen={isSourceDrawerOpen}
        onClose={() => setIsSourceDrawerOpen(false)}
        sources={workspace?.sources ?? []}
        activeSourceId={activeSourceId}
        onSelectSource={(srcId) => setActiveSourceId(srcId)}
      />

      {/* Reset Confirmation Modal */}
      {isResetModalOpen && (
        <ResetModal
          isOpen={isResetModalOpen}
          onClose={() => setIsResetModalOpen(false)}
          onConfirm={handleResetWorkspace}
        />
      )}
    </div>
  );
}
