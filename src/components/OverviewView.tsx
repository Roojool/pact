'use client';

import React, { useState } from 'react';
import {
  Workspace,
  Analysis,
  Commitment,
  AgencyEvent,
  WorkspaceEdit,
  Editor,
  Approval,
} from '@/lib/types';
import {
  Clock,
  Calendar,
  Edit2,
  FileText,
  Check,
  X,
  HelpCircle,
  CalendarClock,
  Info,
} from 'lucide-react';
import { CommitmentModal, EventModal, formatEventHour } from './EditModals';

interface OverviewViewProps {
  workspace: Workspace | null;
  analysis: Analysis | null;
  onEditWorkspace: (edit: WorkspaceEdit) => Promise<void>;
  onOpenSourceDrawer: (sourceId?: string) => void;
}

export function OverviewView({
  workspace,
  analysis,
  onEditWorkspace,
  onOpenSourceDrawer,
}: OverviewViewProps) {
  const [selectedCommitment, setSelectedCommitment] = useState<Commitment | null>(null);
  const [selectedEvent, setSelectedEvent] = useState<AgencyEvent | null>(null);

  if (!workspace) return null;

  // Active allocations from checked analysis or committed decision (never unapproved proposals)
  const activeAllocations =
    analysis?.check?.allocations ??
    workspace.decisions?.[0]?.allocations ??
    [];

  // Helper to format 0..15 editor working availability slots
  // Slots 0..7 are Day 1 09:00–17:00; 8..15 are Day 2 09:00–17:00.
  const formatSlotTime = (slotIndex: number) => {
    const day = slotIndex < 8 ? 1 : 2;
    const hourInDay = slotIndex >= 8 ? slotIndex - 8 : slotIndex;
    const hour24 = 9 + hourInDay;
    const nextHour = hour24 + 1;
    return `Day ${day} ${hour24}:00–${nextHour}:00`;
  };

  // Dynamic capacity calculations (no hardcoding)
  const day1Commitments = workspace.commitments.filter((c) => c.deadlineDay === 1);
  const day2Commitments = workspace.commitments.filter((c) => c.deadlineDay === 2);
  const hasUnknownDay1 = day1Commitments.some((c) => c.hours === null);
  const hasUnknownDay2 = day2Commitments.some((c) => c.hours === null);
  const day1DemandHours = day1Commitments.reduce((sum, c) => sum + (c.hours ?? 0), 0);
  const day2DemandHours = day2Commitments.reduce((sum, c) => sum + (c.hours ?? 0), 0);
  const day1DemandDisplay = hasUnknownDay1
    ? (day1DemandHours > 0 ? `${day1DemandHours}h + unknown` : 'Unknown')
    : `${day1DemandHours}h`;
  const day2DemandDisplay = hasUnknownDay2
    ? (day2DemandHours > 0 ? `${day2DemandHours}h + unknown` : 'Unknown')
    : `${day2DemandHours}h`;

  const alex = workspace.editors.find((e) => e.name.toLowerCase().includes('alex')) || workspace.editors[0];
  const alexDay1Hours = alex ? alex.slots.filter((s) => s < 8).length : 0;
  const alexDay2Hours = alex ? alex.slots.filter((s) => s >= 8).length : 0;

  // Handle slot toggle for editor availability
  const handleToggleSlot = async (editor: Editor, slotIndex: number) => {
    try {
      const currentSlots = [...editor.slots];
      const exists = currentSlots.includes(slotIndex);
      const newSlots = exists
        ? currentSlots.filter((s) => s !== slotIndex)
        : [...currentSlots, slotIndex].sort((a, b) => a - b);

      await onEditWorkspace({
        kind: 'editor',
        id: editor.id,
        slots: newSlots,
      });
    } catch {
      // Error handled and displayed in parent ErrorAlert banner
    }
  };

  // Handle approval toggle
  const handleToggleApproval = async (approval: Approval) => {
    try {
      await onEditWorkspace({
        kind: 'approval',
        id: approval.id,
        approved: !approval.approved,
      });
    } catch {
      // Error handled and displayed in parent ErrorAlert banner
    }
  };

  // Quick deadline toggle
  const handleQuickDeadlineToggle = async (commitment: Commitment) => {
    try {
      const nextDeadline = commitment.deadlineDay === 1 ? 2 : 1;
      await onEditWorkspace({
        kind: 'commitment',
        id: commitment.id,
        deadlineDay: nextDeadline,
      });
    } catch {
      // Error handled and displayed in parent ErrorAlert banner
    }
  };

  return (
    <div className="wrap" style={{ display: 'flex', flexDirection: 'column', gap: '36px', paddingTop: '1.5rem', paddingBottom: '4rem' }} data-testid="overview-view" data-view="overview">
      {/* Anchor target for hero 'View your work' button */}
      <div id="studio-work" style={{ scrollMarginTop: '80px' }} />

      {/* SECTION 1: CAMPAIGNS & JOBS (Assembly-style numbered section header) */}
      <section>
        <div className="editorial-section-header">
          <div>
            <span className="editorial-section-number">01</span>
            <span className="editorial-label">Your work</span>
            <h2 className="editorial-headline" style={{ fontSize: '2.2rem', marginTop: '2px' }}>
              Jobs in the plan
            </h2>
          </div>
          <span className="mono" style={{ fontSize: '0.8rem', color: 'var(--ink-tertiary)' }}>
            {workspace.campaigns.length} campaigns · {workspace.commitments.length} jobs
          </span>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(360px, 1fr))', gap: '16px' }}>
          {workspace.campaigns.map((camp) => {
            const creator = workspace.creators.find((c) => c.id === camp.creatorId);
            const owner = workspace.people.find((p) => p.id === camp.ownerId);
            const commitment = workspace.commitments.find((c) => c.campaignId === camp.id);
            const isUnknownHours = commitment ? commitment.hours === null : false;

            return (
              <div
                key={camp.id}
                className="paper-card"
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  overflow: 'hidden',
                }}
              >
                {/* Restrained Editorial Header Strip */}
                <div
                  className="grain"
                  style={{
                    position: 'relative',
                    height: '38px',
                    background: `linear-gradient(135deg, ${camp.color || '#C22A08'}, #FFA81C)`,
                    overflow: 'hidden',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '0 14px',
                    borderBottom: '1.5px solid var(--ink)',
                  }}
                >
                  <svg
                    viewBox="0 0 100 100"
                    aria-hidden="true"
                    style={{
                      position: 'absolute',
                      right: '-8px',
                      top: '-12px',
                      width: '60px',
                      height: '60px',
                      opacity: 0.3,
                      pointerEvents: 'none',
                    }}
                  >
                    <use href="#sf" />
                  </svg>
                  <span
                    className="mono"
                    style={{
                      position: 'relative',
                      zIndex: 2,
                      fontSize: '0.68rem',
                      color: '#FFFFFF',
                      letterSpacing: '0.12em',
                      fontWeight: 700,
                      backgroundColor: 'rgba(14, 11, 8, 0.45)',
                      padding: '2px 8px',
                      borderRadius: 'var(--radius-xs)',
                    }}
                  >
                    {camp.brand}
                  </span>
                  <span
                    className="mono"
                    style={{
                      position: 'relative',
                      zIndex: 2,
                      fontSize: '0.64rem',
                      color: 'rgba(255, 255, 255, 0.9)',
                      letterSpacing: '0.08em',
                    }}
                  >
                    {creator?.category || 'Creator'}
                  </span>
                </div>

                <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '14px', flex: 1 }}>
                  {/* Campaign Header */}
                  <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <div
                      style={{
                        width: '36px',
                        height: '36px',
                        borderRadius: '50%',
                        backgroundColor: creator?.color || 'var(--clay-200)',
                        color: '#FFFFFF',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontWeight: 700,
                        fontSize: '0.82rem',
                      }}
                    >
                      {creator?.initials || 'CR'}
                    </div>
                    <div>
                      <h3 style={{ fontSize: '0.98rem', fontWeight: 600, color: 'var(--ink-primary)' }}>
                        {creator?.name || camp.name}
                      </h3>
                      <div style={{ fontSize: '0.74rem', color: 'var(--ink-tertiary)' }}>
                        {creator?.handle} • {creator?.category}
                      </div>
                    </div>
                  </div>

                  <span
                    className="badge-status neutral"
                    style={{ fontSize: '0.7rem', padding: '2px 8px' }}
                  >
                    {camp.brand}
                  </span>
                </div>

                {/* Campaign Meta Details */}
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '1fr 1fr',
                    gap: '8px',
                    padding: '10px 12px',
                    backgroundColor: 'var(--paper-subtle)',
                    borderRadius: 'var(--radius-xs)',
                    fontSize: '0.78rem',
                  }}
                >
                  <div>
                    <span style={{ color: 'var(--ink-tertiary)', display: 'block', fontSize: '0.68rem', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                      Campaign Title
                    </span>
                    <span style={{ fontWeight: 600 }}>{camp.name}</span>
                  </div>
                  <div>
                    <span style={{ color: 'var(--ink-tertiary)', display: 'block', fontSize: '0.68rem', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                      Lead Producer
                    </span>
                    <span style={{ fontWeight: 600 }}>{owner?.name || 'Producer'}</span>
                  </div>
                </div>

                {/* Commitment Block */}
                {commitment ? (
                  <div
                    style={{
                      borderTop: '1px solid var(--paper-border)',
                      paddingTop: '12px',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '8px',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <span className="editorial-label" style={{ fontSize: '0.68rem' }}>
                        Job
                      </span>
                      <span
                        className={`badge-status ${
                          commitment.status === 'committed' ? 'feasible' : 'neutral'
                        }`}
                        style={{ fontSize: '0.68rem', padding: '1px 6px' }}
                      >
                        {commitment.status === 'committed' ? 'Committed' : 'Proposed'}
                      </span>
                    </div>

                    <div style={{ fontWeight: 600, fontSize: '0.9rem', color: 'var(--ink-primary)' }}>
                      {commitment.title}
                    </div>

                    {/* Hours & Deadline Display */}
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '0.82rem' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <Clock size={14} style={{ color: 'var(--ink-tertiary)' }} />
                        {isUnknownHours ? (
                          <span
                            className="badge-status needs-info"
                            style={{ fontSize: '0.72rem', padding: '1px 6px' }}
                          >
                            <HelpCircle size={11} />
                            Unknown duration
                          </span>
                        ) : (
                          <span>
                            <strong>{commitment.hours}</strong> editor-hours
                          </span>
                        )}
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <Calendar size={14} style={{ color: 'var(--ink-tertiary)' }} />
                        <span>
                          Deadline:{' '}
                          <strong style={{ color: commitment.deadlineDay === 1 ? 'var(--orange-base)' : 'var(--forest-base)' }}>
                            Day {commitment.deadlineDay}
                          </strong>
                        </span>
                      </div>
                    </div>

                    {/* Interactive Action Controls */}
                    <div style={{ display: 'flex', gap: '8px', marginTop: '4px' }}>
                      <button
                        type="button"
                        onClick={() => setSelectedCommitment(commitment)}
                        className="btn-editorial-secondary"
                        style={{ flex: 1, padding: '5px 10px', fontSize: '0.75rem' }}
                      >
                        <Edit2 size={12} />
                        Edit job
                      </button>

                      <button
                        type="button"
                        onClick={() => handleQuickDeadlineToggle(commitment)}
                        className="btn-editorial-secondary"
                        style={{
                          padding: '5px 10px',
                          fontSize: '0.75rem',
                          backgroundColor: commitment.deadlineDay === 1 ? 'var(--orange-light)' : 'var(--forest-light)',
                          borderColor: commitment.deadlineDay === 1 ? 'var(--orange-border)' : 'var(--forest-border)',
                          color: commitment.deadlineDay === 1 ? 'var(--orange-text)' : 'var(--forest-base)',
                        }}
                        title={`Shift deadline to Day ${commitment.deadlineDay === 1 ? 2 : 1}`}
                      >
                        <CalendarClock size={12} />
                        Shift to Day {commitment.deadlineDay === 1 ? 2 : 1}
                      </button>

                      <button
                        type="button"
                        onClick={() => onOpenSourceDrawer(camp.sourceId)}
                        className="btn-editorial-secondary"
                        style={{ padding: '5px 8px', fontSize: '0.75rem' }}
                        title="View brief document"
                      >
                        <FileText size={12} />
                      </button>
                    </div>
                  </div>
                ) : (
                  <div style={{ fontSize: '0.8rem', color: 'var(--ink-tertiary)' }}>No deliverables attached.</div>
                )}
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* SECTION 2: EDITING AVAILABILITY & WORKING HOURS */}
      <section>
        <div className="editorial-section-header">
          <div>
            <span className="editorial-section-number">02</span>
            <span className="editorial-label">Working hours</span>
            <h2 className="editorial-headline" style={{ fontSize: '1.4rem', marginTop: '2px' }}>
              Who is available to edit
            </h2>
          </div>
          <span style={{ fontSize: '0.78rem', color: 'var(--ink-tertiary)' }}>
            Click any working hour to adjust availability
          </span>
        </div>

        {/* Dynamic Capacity Timeline Header */}
        <div className="paper-card" style={{ padding: '20px' }}>
          <div className="timeline-day-headers">
            <div
              style={{
                backgroundColor: 'var(--paper-subtle)',
                padding: '6px 12px',
                borderRadius: 'var(--radius-xs)',
                fontWeight: 600,
                fontSize: '0.8rem',
                borderLeft: '3px solid var(--orange-base)',
                display: 'flex',
                justifyContent: 'space-between',
              }}
            >
              <span>Day 1: 09:00 – 17:00</span>
              <span className="font-mono" style={{ fontSize: '0.72rem', color: 'var(--orange-text)' }}>
                Demand {day1DemandDisplay} vs Alex {alexDay1Hours}h Capacity
              </span>
            </div>

            <div
              style={{
                backgroundColor: 'var(--paper-subtle)',
                padding: '6px 12px',
                borderRadius: 'var(--radius-xs)',
                fontWeight: 600,
                fontSize: '0.8rem',
                borderLeft: '3px solid var(--forest-base)',
                display: 'flex',
                justifyContent: 'space-between',
              }}
            >
              <span>Day 2: 09:00 – 17:00</span>
              <span className="font-mono" style={{ fontSize: '0.72rem', color: 'var(--forest-base)' }}>
                Demand {day2DemandDisplay} vs Alex {alexDay2Hours}h Capacity
              </span>
            </div>
          </div>

          {/* Editors Rows */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            {workspace.editors.map((editor) => {
              const day1Count = editor.slots.filter((s) => s < 8).length;
              const day2Count = editor.slots.filter((s) => s >= 8).length;

              return (
                <div key={editor.id} style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span
                        style={{
                          width: '24px',
                          height: '24px',
                          borderRadius: '50%',
                          backgroundColor: 'var(--ink-primary)',
                          color: '#FFFFFF',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontSize: '0.72rem',
                          fontWeight: 700,
                        }}
                      >
                        {editor.initials}
                      </span>
                      <span style={{ fontWeight: 600, fontSize: '0.9rem' }}>{editor.name}</span>
                    </div>

                    <div style={{ display: 'flex', gap: '12px', fontSize: '0.78rem' }}>
                      <span>
                        Day 1: <strong>{day1Count}h</strong> / 8h
                      </span>
                      <span>
                        Day 2: <strong>{day2Count}h</strong> / 8h
                      </span>
                      <span style={{ color: 'var(--ink-tertiary)' }}>
                        Total: <strong>{editor.slots.length}h</strong>
                      </span>
                    </div>
                  </div>

                  {/* 16-Hour Availability Grid inside genuinely horizontally scrollable wrapper */}
                  <div
                    className="timeline-scroll-wrapper"
                    tabIndex={0}
                    role="region"
                    aria-label={`Editing hours for ${editor.name}`}
                  >
                    <div className="timeline-grid">
                      {Array.from({ length: 16 }).map((_, slotIdx) => {
                        const isAvailable = editor.slots.includes(slotIdx);
                        const isDayBoundary = slotIdx === 7;
                        const allocation = activeAllocations.find(
                          (a) => a.editorId === editor.id && a.slots.includes(slotIdx)
                        );

                        return (
                          <div
                            key={slotIdx}
                            onClick={() => handleToggleSlot(editor, slotIdx)}
                            className={`slot-cell ${isDayBoundary ? 'slot-day-boundary' : ''} ${
                              allocation ? 'slot-allocated' : isAvailable ? 'slot-available' : 'slot-unavailable'
                            }`}
                            title={`${editor.name} ${formatSlotTime(slotIdx)}: ${
                              allocation ? 'Allocated' : isAvailable ? 'Available (Click to toggle)' : 'Unavailable (Click to toggle)'
                            }`}
                          >
                            <span style={{ fontSize: '0.65rem' }}>#{slotIdx}</span>
                            <span style={{ fontSize: '0.6rem', opacity: 0.8 }}>
                              {slotIdx < 8 ? `${9 + slotIdx}h` : `${9 + (slotIdx - 8)}h`}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* SECTION 3: POLICY APPROVAL MATRIX */}
      <section>
        <div className="editorial-section-header">
          <div>
            <span className="editorial-section-number">03</span>
            <span className="editorial-label">Client approvals</span>
            <h2 className="editorial-headline" style={{ fontSize: '1.4rem', marginTop: '2px' }}>
              Who can work on what
            </h2>
          </div>
          <span style={{ fontSize: '0.78rem', color: 'var(--ink-tertiary)' }}>
            Client policy decides which editors may take each campaign
          </span>
        </div>

        <div className="paper-card" style={{ padding: '0', overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
            <thead>
              <tr style={{ backgroundColor: 'var(--paper-subtle)', borderBottom: '1px solid var(--paper-border-strong)' }}>
                <th style={{ padding: '12px 18px', textAlign: 'left', fontWeight: 600, fontSize: '0.74rem', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                  Editor
                </th>
                {workspace.campaigns.map((camp) => (
                  <th key={camp.id} style={{ padding: '12px 18px', textAlign: 'center', fontWeight: 600, fontSize: '0.74rem', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                    {camp.name} ({camp.brand})
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {workspace.editors.map((editor) => (
                <tr key={editor.id} style={{ borderBottom: '1px solid var(--paper-border)' }}>
                  <td style={{ padding: '14px 18px', fontWeight: 600 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span
                        style={{
                          width: '20px',
                          height: '20px',
                          borderRadius: '50%',
                          backgroundColor: 'var(--ink-secondary)',
                          color: '#FFF',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontSize: '0.65rem',
                          fontWeight: 700,
                        }}
                      >
                        {editor.initials}
                      </span>
                      <span>{editor.name}</span>
                    </div>
                  </td>

                  {workspace.campaigns.map((camp) => {
                    const approval = workspace.approvals.find(
                      (a) => a.editorId === editor.id && a.campaignId === camp.id
                    );

                    if (!approval) {
                      return (
                        <td key={camp.id} style={{ padding: '14px 18px', textAlign: 'center', color: 'var(--ink-muted)' }}>
                          No approval on file
                        </td>
                      );
                    }

                    return (
                      <td key={camp.id} style={{ padding: '14px 18px', textAlign: 'center' }}>
                        <button
                          type="button"
                          onClick={() => handleToggleApproval(approval)}
                          className={`badge-status ${approval.approved ? 'feasible' : 'infeasible'}`}
                          style={{
                            cursor: 'pointer',
                            padding: '4px 12px',
                            border: approval.approved ? '1px solid var(--forest-border)' : '1px solid var(--orange-border)',
                          }}
                          title={`Click to ${approval.approved ? 'revoke' : 'grant'} approval for ${editor.name} on ${camp.name}`}
                        >
                          {approval.approved ? (
                            <>
                              <Check size={12} /> Approved
                            </>
                          ) : (
                            <>
                              <X size={12} /> Unapproved
                            </>
                          )}
                        </button>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* SECTION 4: STUDIO EVENTS (0..48 HOURS FROM DAY 1 START) */}
      {workspace.events && workspace.events.length > 0 && (
        <section>
          <div className="editorial-section-header">
            <div>
              <span className="editorial-section-number">04</span>
              <span className="editorial-label">Studio calendar</span>
              <h2 className="editorial-headline" style={{ fontSize: '1.4rem', marginTop: '2px' }}>
                Studio events
              </h2>
            </div>
            <span style={{ fontSize: '0.78rem', color: 'var(--ink-tertiary)' }}>
              Events that affect when work can start or finish
            </span>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '14px' }}>
            {workspace.events.map((event) => {
              const camp = workspace.campaigns.find((c) => c.id === event.campaignId);
              const creator = workspace.creators.find((c) => c.id === event.creatorId);

              return (
                <div key={event.id} className="paper-card" style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <span style={{ fontWeight: 600, fontSize: '0.9rem' }}>{event.title}</span>
                    <button
                      type="button"
                      onClick={() => setSelectedEvent(event)}
                      className="btn-editorial-secondary"
                      style={{ padding: '3px 8px', fontSize: '0.72rem' }}
                    >
                      <Edit2 size={11} />
                      Edit
                    </button>
                  </div>

                  <div style={{ fontSize: '0.78rem', color: 'var(--ink-secondary)' }}>
                    Campaign: <strong>{camp?.name}</strong> • Creator: <strong>{creator?.name}</strong>
                  </div>

                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      fontSize: '0.78rem',
                      fontFamily: 'var(--font-mono)',
                      backgroundColor: 'var(--paper-subtle)',
                      padding: '8px 12px',
                      borderRadius: 'var(--radius-xs)',
                      flexWrap: 'wrap',
                    }}
                  >
                    <span>Start: {formatEventHour(event.start)}</span>
                    <span>→</span>
                    <span>End: {formatEventHour(event.end)}</span>
                    <span style={{ color: 'var(--ink-secondary)', marginLeft: 'auto', fontWeight: 600 }}>
                      Duration: {Math.max(0, event.end - event.start)}h
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* OPTIONAL TECHNICAL DETAILS (initially collapsed) */}
      <section>
        <details data-testid="overview-technical-details">
          <summary>How PACT checks</summary>
          <div
            className="pact-inline-note"
            style={{
              marginTop: '10px',
              padding: '12px 16px',
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
              fontSize: '0.8rem',
              color: 'var(--ink-secondary)',
            }}
          >
            <Info size={15} style={{ color: 'var(--ink-tertiary)', flexShrink: 0 }} />
            <span>
              PACT checks a 2-day studio horizon (48 hours), editor jobs up to 8 hours, and 16 one-hour working windows
              (Day 1 &amp; Day 2, 09:00–17:00). It never guesses a duration or an approval.
            </span>
          </div>
        </details>
      </section>

      {/* Modals: always initialize from selected record using keys */}
      {selectedCommitment && (
        <CommitmentModal
          key={selectedCommitment.id}
          commitment={selectedCommitment}
          onClose={() => setSelectedCommitment(null)}
          onSave={onEditWorkspace}
        />
      )}
      {selectedEvent && (
        <EventModal
          key={selectedEvent.id}
          event={selectedEvent}
          onClose={() => setSelectedEvent(null)}
          onSave={onEditWorkspace}
        />
      )}
    </div>
  );
}
