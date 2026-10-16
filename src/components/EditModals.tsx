'use client';

import React, { useState, useEffect, useRef } from 'react';
import { Commitment, AgencyEvent, Day, WorkspaceEdit } from '@/lib/types';
import { X, Calendar, AlertTriangle } from 'lucide-react';

/**
 * Format hours from the start of Day 1 (0..48, end exclusive)
 * Day 1 covers hours 0..24, Day 2 covers hours 24..48.
 */
export function formatEventHour(hour: number): string {
  const day = hour < 24 ? 1 : 2;
  const hourInDay = hour % 24;
  const timeStr = `${hourInDay.toString().padStart(2, '0')}:00`;
  return `Day ${day}, ${timeStr} (hour ${hour})`;
}

/**
 * Custom hook to trap focus and handle keyboard Escape closing.
 * Returns the container ref and automatically restores focus on unmount.
 */
function useModalFocusTrap(isOpen: boolean, onClose: () => void) {
  const containerRef = useRef<HTMLDivElement>(null);
  const previousActiveElement = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    previousActiveElement.current = document.activeElement as HTMLElement | null;

    const timer = setTimeout(() => {
      const container = containerRef.current;
      if (!container) return;
      const focusables = container.querySelectorAll<HTMLElement>(
        'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
      );
      if (focusables.length > 0) {
        focusables[0].focus();
      } else {
        container.focus();
      }
    }, 20);

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
        return;
      }
      if (e.key === 'Tab' && containerRef.current) {
        const focusables = Array.from(
          containerRef.current.querySelectorAll<HTMLElement>(
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

  return containerRef;
}

/* --------------------------------------------------------------------------
   Commitment Edit Modal
   -------------------------------------------------------------------------- */
interface CommitmentModalProps {
  commitment: Commitment | null;
  onClose: () => void;
  onSave: (edit: WorkspaceEdit) => Promise<void>;
}

export function CommitmentModal({ commitment, onClose, onSave }: CommitmentModalProps) {
  const [isUnknownHours, setIsUnknownHours] = useState(commitment?.hours === null);
  // Supported checker/API bound is 1..8
  const [hours, setHours] = useState<number>(
    commitment?.hours !== null && commitment?.hours !== undefined
      ? Math.min(8, Math.max(1, commitment.hours))
      : 4
  );
  const [deadlineDay, setDeadlineDay] = useState<Day>(commitment?.deadlineDay ?? 1);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const containerRef = useModalFocusTrap(Boolean(commitment), onClose);

  if (!commitment) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;

    if (!isUnknownHours && (hours < 1 || hours > 8)) {
      setFormError('Commitment duration must be between 1 and 8 work hours.');
      return;
    }

    setFormError(null);
    setIsSubmitting(true);
    try {
      await onSave({
        kind: 'commitment',
        id: commitment.id,
        hours: isUnknownHours ? null : Math.min(8, Math.max(1, Number(hours))),
        deadlineDay,
      });
      onClose();
    } catch (err: unknown) {
      const typedErr = err as { message?: string };
      setFormError(typedErr.message || 'Failed to update deliverable.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div
      className="modal-backdrop"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="commitment-modal-title"
    >
      <div
        ref={containerRef}
        tabIndex={-1}
        className="modal-card"
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
          <div>
            <span className="editorial-label">Your work</span>
            <h3 id="commitment-modal-title" className="editorial-headline" style={{ fontSize: '1.2rem', marginTop: '2px' }}>
              Edit this job
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="btn-editorial-secondary"
            style={{ padding: '4px', borderRadius: '50%' }}
            aria-label="Close dialog"
            disabled={isSubmitting}
          >
            <X size={16} />
          </button>
        </div>

        {formError && (
          <div
            style={{
              padding: '8px 12px',
              backgroundColor: 'var(--clay-50)',
              border: '1px solid var(--clay-200)',
              borderRadius: 'var(--radius-xs)',
              fontSize: '0.8rem',
              color: 'var(--clay-800)',
              marginBottom: '14px',
            }}
          >
            {formError}
          </div>
        )}

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div style={{ padding: '10px 12px', backgroundColor: 'var(--paper-subtle)', borderRadius: 'var(--radius-xs)' }}>
            <span style={{ fontSize: '0.75rem', color: 'var(--ink-tertiary)', display: 'block' }}>
              Job
            </span>
            <span style={{ fontWeight: 600, fontSize: '0.9rem' }}>{commitment.title}</span>
          </div>

          {/* Hours Input (Supported bound 1..8) */}
          <div>
            <label
              htmlFor="commitment-hours-input"
              style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, marginBottom: '6px' }}
            >
              Editing hours needed
            </label>

            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '8px' }}>
              <label
                htmlFor="unknown-duration-checkbox"
                style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.82rem', cursor: 'pointer' }}
              >
                <input
                  id="unknown-duration-checkbox"
                  type="checkbox"
                  checked={isUnknownHours}
                  onChange={(e) => setIsUnknownHours(e.target.checked)}
                />
                Hours not known yet
              </label>
            </div>

            {!isUnknownHours && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <input
                  id="commitment-hours-input"
                  type="number"
                  min="1"
                  max="8"
                  step="1"
                  value={hours}
                  onChange={(e) => setHours(Math.min(8, Math.max(1, parseInt(e.target.value) || 1)))}
                  className="editorial-input"
                  style={{ width: '120px' }}
                  required
                />
                <span style={{ fontSize: '0.85rem', color: 'var(--ink-secondary)' }}>hours (1–8)</span>
              </div>
            )}
            <p style={{ fontSize: '0.75rem', color: 'var(--ink-tertiary)', marginTop: '4px' }}>
              Choose &ldquo;Hours not known yet&rdquo; when the brief does not say. PACT then asks for the hours instead
              of guessing, and this job stays out of the schedule until they are confirmed.
            </p>
          </div>

          {/* Deadline Day */}
          <div>
            <span id="deadline-day-label" style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, marginBottom: '6px' }}>
              Deadline day
            </span>
            <div style={{ display: 'flex', gap: '12px' }} role="group" aria-labelledby="deadline-day-label">
              {[1, 2].map((day) => (
                <button
                  key={day}
                  type="button"
                  onClick={() => setDeadlineDay(day as Day)}
                  className={`btn-editorial-secondary ${deadlineDay === day ? 'active' : ''}`}
                  style={{
                    flex: 1,
                    borderColor: deadlineDay === day ? 'var(--ink-primary)' : 'var(--paper-border-strong)',
                    backgroundColor: deadlineDay === day ? 'var(--ink-primary)' : 'var(--paper-surface)',
                    color: deadlineDay === day ? '#FFFFFF' : 'var(--ink-primary)',
                    fontWeight: deadlineDay === day ? 600 : 500,
                  }}
                  aria-pressed={deadlineDay === day}
                >
                  <Calendar size={14} />
                  Day {day}
                </button>
              ))}
            </div>
            <p style={{ fontSize: '0.75rem', color: 'var(--ink-tertiary)', marginTop: '4px' }}>
              Day 2 gives you another working day, as long as the brief allows this job to move.
            </p>
          </div>

          {/* Modal Actions */}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '12px' }}>
            <button
              type="button"
              onClick={onClose}
              className="btn-editorial-secondary"
              disabled={isSubmitting}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="btn-editorial-primary"
              disabled={isSubmitting}
            >
              {isSubmitting ? 'Saving changes…' : 'Save job'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

/* --------------------------------------------------------------------------
   Event Edit Modal
   Events are integer hours from start of Day 1 (0..48, end exclusive)
   -------------------------------------------------------------------------- */
interface EventModalProps {
  event: AgencyEvent | null;
  onClose: () => void;
  onSave: (edit: WorkspaceEdit) => Promise<void>;
}

export function EventModal({ event, onClose, onSave }: EventModalProps) {
  const [start, setStart] = useState<number>(event?.start ?? 0);
  const [end, setEnd] = useState<number>(event?.end ?? 4);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const containerRef = useModalFocusTrap(Boolean(event), onClose);

  if (!event) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;

    if (end <= start) {
      setFormError('Event end hour must be greater than start hour.');
      return;
    }
    if (start < 0 || start > 47) {
      setFormError('Start hour must be between 0 and 47 (hours from Day 1 start).');
      return;
    }
    if (end < 1 || end > 48) {
      setFormError('End hour must be between 1 and 48 (hours from Day 1 start).');
      return;
    }

    setFormError(null);
    setIsSubmitting(true);
    try {
      await onSave({
        kind: 'event',
        id: event.id,
        start: Number(start),
        end: Number(end),
      });
      onClose();
    } catch (err: unknown) {
      const typedErr = err as { message?: string };
      setFormError(typedErr.message || 'Failed to update event window.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div
      className="modal-backdrop"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="event-modal-title"
    >
      <div
        ref={containerRef}
        tabIndex={-1}
        className="modal-card"
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
          <div>
            <span className="editorial-label">Team calendar</span>
            <h3 id="event-modal-title" className="editorial-headline" style={{ fontSize: '1.2rem', marginTop: '2px' }}>
              Edit this event
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="btn-editorial-secondary"
            style={{ padding: '4px', borderRadius: '50%' }}
            aria-label="Close dialog"
            disabled={isSubmitting}
          >
            <X size={16} />
          </button>
        </div>

        {formError && (
          <div
            style={{
              padding: '8px 12px',
              backgroundColor: 'var(--clay-50)',
              border: '1px solid var(--clay-200)',
              borderRadius: 'var(--radius-xs)',
              fontSize: '0.8rem',
              color: 'var(--clay-800)',
              marginBottom: '14px',
            }}
          >
            {formError}
          </div>
        )}

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div style={{ padding: '10px 12px', backgroundColor: 'var(--paper-subtle)', borderRadius: 'var(--radius-xs)' }}>
            <span style={{ fontWeight: 600, fontSize: '0.9rem', display: 'block' }}>{event.title}</span>
            <span style={{ fontSize: '0.75rem', color: 'var(--ink-secondary)' }}>
              Current window: {formatEventHour(event.start)} → {formatEventHour(event.end)} ({event.end - event.start}h)
            </span>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
            <div>
              <label
                htmlFor="event-start-input"
                style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, marginBottom: '6px' }}
              >
                Start
              </label>
              <input
                id="event-start-input"
                type="number"
                min="0"
                max="47"
                value={start}
                onChange={(e) => setStart(Math.min(47, Math.max(0, parseInt(e.target.value) || 0)))}
                className="editorial-input"
                required
              />
              <span style={{ fontSize: '0.72rem', color: 'var(--ink-tertiary)', marginTop: '4px', display: 'block' }}>
                {formatEventHour(start)}
              </span>
            </div>

            <div>
              <label
                htmlFor="event-end-input"
                style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, marginBottom: '6px' }}
              >
                End
              </label>
              <input
                id="event-end-input"
                type="number"
                min="1"
                max="48"
                value={end}
                onChange={(e) => setEnd(Math.min(48, Math.max(1, parseInt(e.target.value) || 1)))}
                className="editorial-input"
                required
              />
              <span style={{ fontSize: '0.72rem', color: 'var(--ink-tertiary)', marginTop: '4px', display: 'block' }}>
                {formatEventHour(end)}
              </span>
            </div>
          </div>

          <div style={{ fontSize: '0.78rem', color: 'var(--ink-secondary)', backgroundColor: 'var(--paper-subtle)', padding: '8px 12px', borderRadius: 'var(--radius-xs)' }}>
            <p style={{ marginBottom: '6px' }}>
              Hours are counted from the start of Day 1: hour 0 is Day 1, 09:00 and hour 24 is Day 2, 09:00. The
              friendly time is shown under each box.
            </p>
            Total event duration: <strong>{Math.max(0, end - start)}h</strong>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '12px' }}>
            <button
              type="button"
              onClick={onClose}
              className="btn-editorial-secondary"
              disabled={isSubmitting}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="btn-editorial-primary"
              disabled={isSubmitting}
            >
              {isSubmitting ? 'Saving changes…' : 'Save event'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

/* --------------------------------------------------------------------------
   Start Over / Reset Confirmation Modal
   -------------------------------------------------------------------------- */
interface ResetModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => Promise<void>;
}

export function ResetModal({ isOpen, onClose, onConfirm }: ResetModalProps) {
  const [isResetting, setIsResetting] = useState(false);
  const containerRef = useModalFocusTrap(isOpen, onClose);

  if (!isOpen) return null;

  const handleConfirm = async () => {
    if (isResetting) return;
    setIsResetting(true);
    try {
      await onConfirm();
      onClose();
    } finally {
      setIsResetting(false);
    }
  };

  return (
    <div
      className="modal-backdrop"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="reset-modal-title"
    >
      <div
        ref={containerRef}
        tabIndex={-1}
        className="modal-card"
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: '14px', marginBottom: '16px' }}>
          <div
            style={{
              padding: '10px',
              borderRadius: '50%',
              backgroundColor: 'var(--clay-100)',
              color: 'var(--clay-700)',
            }}
          >
            <AlertTriangle size={20} />
          </div>
          <div>
            <span className="editorial-label" style={{ color: 'var(--clay-700)' }}>
              Start over
            </span>
            <h3 id="reset-modal-title" className="editorial-headline" style={{ fontSize: '1.25rem', marginTop: '2px' }}>
              Start over?
            </h3>
          </div>
        </div>

        <p style={{ fontSize: '0.88rem', color: 'var(--ink-secondary)', lineHeight: '1.5', marginBottom: '20px' }}>
          This restores the sample Morrow Studio plan: its campaigns, editor availability and client approvals. Any
          edits you have made here will be cleared.
        </p>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
          <button
            type="button"
            onClick={onClose}
            className="btn-editorial-secondary"
            disabled={isResetting}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            className="btn-editorial-clay"
            disabled={isResetting}
          >
            {isResetting ? 'Resetting schedule…' : 'Start over'}
          </button>
        </div>
      </div>
    </div>
  );
}
