'use client';

import React, { useState } from 'react';
import { Workspace, AgentReply, Activity } from '@/lib/types';
import {
  Send,
  Sparkles,
  ShieldCheck,
  FileText,
  AlertCircle,
} from 'lucide-react';

interface StudioMemoryProps {
  workspace: Workspace | null;
  replies: AgentReply[];
  onSendMessage: (message: string) => Promise<void>;
  onOpenSourceDrawer: (sourceId?: string) => void;
  isSending: boolean;
  isLiveAiEnabled: boolean;
  isLiveCapable: boolean;
}

export function StudioMemoryView({
  workspace,
  replies,
  onSendMessage,
  onOpenSourceDrawer,
  isSending,
  isLiveAiEnabled,
  isLiveCapable,
}: StudioMemoryProps) {
  const [inputMessage, setInputMessage] = useState('');

  if (!workspace) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputMessage.trim() || isSending) return;
    const msg = inputMessage.trim();
    setInputMessage('');
    await onSendMessage(msg);
  };

  const handleQuickPrompt = async (promptText: string) => {
    if (isSending) return;
    await onSendMessage(promptText);
  };

  const quickPrompts = [
    'What needs attention before I commit?',
    'Who still needs to approve a job?',
    'What happens if I move a job to Day 2?',
    'Summarize the recent decisions.',
  ];

  const isLiveActive = isLiveAiEnabled && isLiveCapable;

  return (
    <div className="wrap" style={{ display: 'flex', flexDirection: 'column', gap: '32px', paddingTop: '1.5rem', paddingBottom: '4rem' }} data-testid="memory-view" data-view="memory">
      {/* SECTION 1: HEADER & INTRO */}
      <div className="editorial-section-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <svg width="38" height="38" viewBox="0 0 100 100" aria-hidden="true" style={{ flexShrink: 0 }}>
            <use href="#sf" />
          </svg>
          <div>
            <span className="editorial-section-number">01</span>
            <span className="editorial-label">Ask PACT</span>
            <h2 className="editorial-headline" style={{ fontSize: '2.2rem', marginTop: '2px' }}>
              Ask about your plan
            </h2>
          </div>
        </div>
        <span
          className={`badge-status ${
            isLiveActive ? 'live' : 'deterministic'
          }`}
          style={{ fontSize: '0.75rem' }}
        >
          {isLiveActive ? <Sparkles size={12} /> : <ShieldCheck size={12} />}
          {isLiveActive ? 'AI-assisted answer' : 'Rules-based answer'}
        </span>
      </div>

      <p style={{ fontSize: '0.92rem', color: 'var(--ink-secondary)', maxWidth: '780px', marginTop: '-12px' }}>
        Ask in plain language. Answers are grounded in the studio&rsquo;s own records, and PACT says when it is unsure.
      </p>

      {/* SECTION 2: INTERACTIVE QUERY BOX & SUGGESTED PROMPTS */}
      <div className="paper-card" style={{ padding: '24px' }}>
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <label htmlFor="memory-query-input" className="editorial-label">
            Your question
          </label>

          <div style={{ display: 'flex', gap: '10px' }}>
            <input
              id="memory-query-input"
              type="text"
              value={inputMessage}
              onChange={(e) => setInputMessage(e.target.value)}
              placeholder="e.g. What still needs approval before we commit?"
              className="editorial-input"
              disabled={isSending}
              style={{ flex: 1, fontSize: '0.92rem' }}
            />
            <button
              type="submit"
              disabled={isSending || !inputMessage.trim()}
              className="btn-editorial-primary"
              style={{ padding: '0 20px' }}
            >
              {isSending ? (
                'Recalling…'
              ) : (
                <>
                  <Send size={14} />
                  Ask
                </>
              )}
            </button>
          </div>

          {/* Quick Prompts */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
            <span style={{ fontSize: '0.72rem', color: 'var(--ink-tertiary)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
              Try one of these:
            </span>
            {quickPrompts.map((prompt, pIdx) => (
              <button
                key={pIdx}
                type="button"
                onClick={() => handleQuickPrompt(prompt)}
                disabled={isSending}
                className="btn-editorial-secondary"
                style={{
                  fontSize: '0.75rem',
                  padding: '3px 10px',
                  borderRadius: '12px',
                  textAlign: 'left',
                }}
              >
                {prompt}
              </button>
            ))}
          </div>
        </form>
      </div>

      {/* SECTION 3: RECENT RESPONSES */}
      {replies.length > 0 && (
        <section>
          <div className="editorial-section-header">
            <div>
              <span className="editorial-section-number">02</span>
              <span className="editorial-label">Answers</span>
              <h3 className="editorial-headline" style={{ fontSize: '1.25rem', marginTop: '2px' }}>
                Recorded answers ({replies.length})
              </h3>
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            {replies.map((reply, rIdx) => {
              const isDeterministic = reply.mode === 'deterministic';

              return (
                <div
                  key={rIdx}
                  className="paper-card"
                  style={{
                    padding: '22px',
                    borderLeft: isDeterministic ? '4px solid var(--paper-border-strong)' : '4px solid var(--orange-base)',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '12px',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', flexWrap: 'wrap' }}>
                    <span
                      className={`badge-status ${isDeterministic ? 'deterministic' : 'live'}`}
                      style={{ fontSize: '0.72rem' }}
                    >
                      {isDeterministic ? <ShieldCheck size={12} /> : <Sparkles size={12} />}
                      {isDeterministic ? 'Rules-based answer' : 'AI-assisted answer'}
                    </span>

                    {reply.usageUsd !== undefined && reply.usageUsd > 0 && (
                      <details>
                        <summary style={{ fontSize: '0.74rem' }}>Technical details</summary>
                        <span className="font-mono" style={{ fontSize: '0.7rem', color: 'var(--ink-tertiary)' }}>
                          Answer cost: ${reply.usageUsd.toFixed(4)}
                        </span>
                      </details>
                    )}
                  </div>

                  <p
                    style={{
                      fontFamily: 'var(--font-serif)',
                      fontSize: '0.98rem',
                      lineHeight: '1.6',
                      color: 'var(--ink-primary)',
                      whiteSpace: 'pre-wrap',
                    }}
                  >
                    {reply.text}
                  </p>

                  {reply.warning && (
                    <div
                      style={{
                        padding: '8px 12px',
                        backgroundColor: 'var(--orange-light)',
                        border: '1px solid var(--orange-border)',
                        borderRadius: 'var(--radius-xs)',
                        fontSize: '0.78rem',
                        color: 'var(--orange-text)',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px',
                      }}
                    >
                      <AlertCircle size={13} />
                      {reply.warning}
                    </div>
                  )}

                  {/* Grounded Source Citations */}
                  {reply.sourceIds && reply.sourceIds.length > 0 && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', paddingTop: '8px', borderTop: '1px solid var(--paper-border)' }}>
                      <span style={{ fontSize: '0.72rem', color: 'var(--ink-tertiary)', textTransform: 'uppercase' }}>
                        Source evidence:
                      </span>
                      {reply.sourceIds.map((srcId) => {
                        const src = workspace.sources.find((s) => s.id === srcId);
                        return (
                          <button
                            key={srcId}
                            type="button"
                            onClick={() => onOpenSourceDrawer(srcId)}
                            className="btn-editorial-secondary"
                            style={{ padding: '2px 8px', fontSize: '0.72rem', display: 'flex', alignItems: 'center', gap: '4px' }}
                          >
                            <FileText size={11} />
                            {src?.title || 'Source unavailable'}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* SECTION 4: STUDIO ACTIVITY LEDGER */}
      <section>
        <div className="editorial-section-header">
          <div>
            <span className="editorial-section-number">{replies.length > 0 ? '03' : '02'}</span>
            <span className="editorial-label">Recent activity</span>
            <h3 className="editorial-headline" style={{ fontSize: '1.25rem', marginTop: '2px' }}>
              Activity ledger ({workspace.activity?.length ?? 0})
            </h3>
          </div>
          <span style={{ fontSize: '0.78rem', color: 'var(--ink-tertiary)' }}>
            What has happened on this plan so far
          </span>
        </div>

        {workspace.activity && workspace.activity.length > 0 ? (
          <div className="paper-card" style={{ padding: '0', overflow: 'hidden' }}>
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              {workspace.activity.map((item, idx) => {
                const getRoleBadge = (role: Activity['role']) => {
                  switch (role) {
                    case 'producer':
                      return (
                        <span className="badge-status feasible" style={{ fontSize: '0.68rem', padding: '1px 6px' }}>
                          Producer
                        </span>
                      );
                    case 'account_manager':
                      return (
                        <span className="badge-status neutral" style={{ fontSize: '0.68rem', padding: '1px 6px' }}>
                          Account Mgr
                        </span>
                      );
                    case 'system':
                      return (
                        <span className="badge-status deterministic" style={{ fontSize: '0.68rem', padding: '1px 6px' }}>
                          System
                        </span>
                      );
                  }
                };

                return (
                  <div
                    key={item.id || idx}
                    style={{
                      padding: '14px 18px',
                      borderBottom: idx < workspace.activity.length - 1 ? '1px solid var(--paper-border)' : 'none',
                      display: 'flex',
                      alignItems: 'flex-start',
                      gap: '12px',
                    }}
                  >
                    <div style={{ flexShrink: 0, marginTop: '2px' }}>{getRoleBadge(item.role)}</div>

                    <div style={{ flex: 1 }}>
                      <p style={{ fontSize: '0.85rem', color: 'var(--ink-primary)', lineHeight: '1.4' }}>
                        {item.text}
                      </p>

                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '4px' }}>
                        <span style={{ fontSize: '0.7rem', color: 'var(--ink-tertiary)' }}>
                          {new Date(item.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </span>

                        {item.sourceIds && item.sourceIds.length > 0 && (
                          <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                            {item.sourceIds.map((srcId) => {
                              const src = workspace.sources.find((s) => s.id === srcId);
                              return (
                                <button
                                  key={srcId}
                                  type="button"
                                  onClick={() => onOpenSourceDrawer(srcId)}
                                  className="btn-editorial-secondary"
                                  style={{ fontSize: '0.68rem', padding: '1px 8px', display: 'flex', alignItems: 'center', gap: '4px' }}
                                >
                                  <FileText size={10} />
                                  {src?.title || 'Source unavailable'}
                                </button>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ) : (
          <div className="paper-card" style={{ padding: '20px', color: 'var(--ink-tertiary)', fontSize: '0.85rem' }}>
            No activity log entries recorded in this session.
          </div>
        )}
      </section>
    </div>
  );
}
