'use client';

import React from 'react';

export function SkeletonLoader() {
  return (
    <div style={{ padding: '36px', maxWidth: '1200px', margin: '0 auto' }}>
      {/* Top Banner Skeleton */}
      <div
        className="paper-card p-6 mb-8"
        style={{ padding: '24px', marginBottom: '32px' }}
      >
        <div className="skeleton-box" style={{ height: '14px', width: '180px', marginBottom: '16px' }} />
        <div className="skeleton-box" style={{ height: '32px', width: '420px', marginBottom: '12px' }} />
        <div className="skeleton-box" style={{ height: '18px', width: '70%', marginBottom: '24px' }} />
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '16px' }}>
          <div className="skeleton-box" style={{ height: '80px' }} />
          <div className="skeleton-box" style={{ height: '80px' }} />
          <div className="skeleton-box" style={{ height: '80px' }} />
        </div>
      </div>

      {/* Main Grid Skeleton */}
      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '24px' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          <div className="paper-card" style={{ padding: '24px' }}>
            <div className="skeleton-box" style={{ height: '20px', width: '220px', marginBottom: '16px' }} />
            <div className="skeleton-box" style={{ height: '64px', marginBottom: '12px' }} />
            <div className="skeleton-box" style={{ height: '64px', marginBottom: '12px' }} />
            <div className="skeleton-box" style={{ height: '64px' }} />
          </div>

          <div className="paper-card" style={{ padding: '24px' }}>
            <div className="skeleton-box" style={{ height: '20px', width: '260px', marginBottom: '16px' }} />
            <div className="skeleton-box" style={{ height: '100px' }} />
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          <div className="paper-card" style={{ padding: '24px' }}>
            <div className="skeleton-box" style={{ height: '18px', width: '160px', marginBottom: '16px' }} />
            <div className="skeleton-box" style={{ height: '140px' }} />
          </div>
          <div className="paper-card" style={{ padding: '24px' }}>
            <div className="skeleton-box" style={{ height: '18px', width: '190px', marginBottom: '16px' }} />
            <div className="skeleton-box" style={{ height: '180px' }} />
          </div>
        </div>
      </div>

      <div style={{ textAlign: 'center', marginTop: '40px', color: 'var(--ink-tertiary)', fontSize: '0.85rem' }}>
        <span className="font-serif" style={{ fontStyle: 'italic' }}>
          Loading your studio plan…
        </span>
      </div>
    </div>
  );
}
