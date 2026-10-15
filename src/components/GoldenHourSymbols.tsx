'use client';

import React from 'react';

/**
 * Authoritative Golden Hour SVG Symbol Definitions:
 * - p6: 12-petal radial ellipse geometry
 * - sf: Sunflower symbol (two-tone golden petals, seed core, dashed accent rings)
 * - ar: Editorial arrow icon
 */
export function GoldenHourSymbols() {
  return (
    <svg width="0" height="0" style={{ position: 'absolute' }} aria-hidden="true">
      <defs>
        <g id="p6">
          <ellipse cx="50" cy="50" rx="7.5" ry="48" />
          <ellipse cx="50" cy="50" rx="7.5" ry="48" transform="rotate(30 50 50)" />
          <ellipse cx="50" cy="50" rx="7.5" ry="48" transform="rotate(60 50 50)" />
          <ellipse cx="50" cy="50" rx="7.5" ry="48" transform="rotate(90 50 50)" />
          <ellipse cx="50" cy="50" rx="7.5" ry="48" transform="rotate(120 50 50)" />
          <ellipse cx="50" cy="50" rx="7.5" ry="48" transform="rotate(150 50 50)" />
        </g>
        <symbol id="sf" viewBox="0 0 100 100">
          <use href="#p6" fill="#E88A0C" transform="rotate(15 50 50)" />
          <use href="#p6" fill="#FFC21A" />
          <circle cx="50" cy="50" r="21" fill="#3A200E" />
          <circle cx="50" cy="50" r="15" fill="none" stroke="#7A4A1A" strokeWidth="5" strokeDasharray="1.6 3.4" />
          <circle cx="50" cy="50" r="8" fill="none" stroke="#7A4A1A" strokeWidth="4" strokeDasharray="1.4 3" />
        </symbol>
        <symbol id="ar" viewBox="0 0 24 24">
          <path
            d="M4 12h15M13 6l6 6-6 6"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.3"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </symbol>
      </defs>
    </svg>
  );
}
