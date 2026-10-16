import type { Metadata } from 'next';
import './globals.css';
import './dashboard.css';

export const metadata: Metadata = {
  title: 'PACT — Influencer Agency Planning Desk',
  description: 'Studio planning desk that checks creator briefs, editing hours, and client approvals before you commit.',
};

import { GoldenHourSymbols } from '@/components/GoldenHourSymbols';

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased font-sans bg-paper-base text-ink-primary">
        <GoldenHourSymbols />
        {children}
      </body>
    </html>
  );
}
