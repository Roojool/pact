/**
 * PACT core — synthetic seed workspace (the "hero dataset").
 *
 * All data is fictional. The seed encodes the handoff contract:
 *  - Morrow Studio, six creators, three campaigns with distinct creators.
 *  - Each campaign needs 4 editor-hours before the end of Day 1.
 *  - Alex has slots 0..15 (Day 1 + Day 2) and is approved for all campaigns.
 *  - Sam has at least four Day 1 slots, is explicitly NOT approved for campaign C
 *    (cp-c), and has no approval record for A/B (unknown eligibility).
 *  - Campaign C may flex to Day 2; A and B hold their Day 1 dates.
 *  - Pair (A+B) fits on Day 1; the triple does not. Repair: move C to Day 2.
 */
import type { Workspace } from './types';

export function createFixture(id: string): Workspace {
  return {
    id,
    agency: 'Morrow Studio',
    revision: 1,
    creators: [
      { id: 'cr-mia', name: 'Mia Fabel', handle: '@miafabel', category: 'Skincare', initials: 'MF', color: '#b4634a' },
      { id: 'cr-ode', name: 'Ode Ilerioluwa', handle: '@odemakes', category: 'Fitness', initials: 'OI', color: '#7c8c6f' },
      { id: 'cr-ta', name: 'Tamar Qureshi', handle: '@tamarq', category: 'Food & Drink', initials: 'TQ', color: '#c89b5a' },
      { id: 'cr-juno', name: 'Juno Park', handle: '@junopark', category: 'Home', initials: 'JP', color: '#8a7ab5' },
      { id: 'cr-sel', name: 'Selah Brandt', handle: '@selahb', category: 'Fashion', initials: 'SB', color: '#a3577b' },
      { id: 'cr-rio', name: 'Rio Castellanos', handle: '@riocastellanos', category: 'Tech', initials: 'RC', color: '#5f7e8c' },
    ],
    people: [
      { id: 'p-am', name: 'Priya Nair', role: 'Account Manager' },
      { id: 'p-prd', name: 'Theo Okafor', role: 'Producer' },
    ],
    sources: [
      {
        id: 'src-brief-a', title: 'Aurora launch brief', kind: 'brief', revision: 1,
        excerpt: 'Aurora Skincare needs a four-hour edit pass finished before the end of Day 1.',
        updatedAt: '2026-10-12T08:00:00.000Z',
      },
      {
        id: 'src-brief-b', title: 'Beacon challenge brief', kind: 'brief', revision: 1,
        excerpt: 'Beacon Active needs a four-hour edit of the challenge recap before the end of Day 1.',
        updatedAt: '2026-10-12T08:10:00.000Z',
      },
      {
        id: 'src-brief-c', title: 'Comet launch film brief', kind: 'brief', revision: 1,
        excerpt: 'Comet Roasters needs a four-hour cut of the launch film before the end of Day 1.',
        updatedAt: '2026-10-12T08:20:00.000Z',
      },
      {
        id: 'src-policy', title: 'Editing approval policy', kind: 'policy', revision: 1,
        excerpt: 'Editors may only work a campaign with a recorded approval. Sam Ashby is not approved for the Comet launch film.',
        updatedAt: '2026-10-13T09:00:00.000Z',
      },
      {
        id: 'src-cal', title: 'Editor calendar', kind: 'calendar', revision: 1,
        excerpt: 'Alex Rivera is available Day 1 and Day 2, 09:00-17:00. Sam Ashby is available Day 1 only, 09:00-13:00.',
        updatedAt: '2026-10-13T17:30:00.000Z',
      },
      {
        id: 'src-handoff', title: 'Day 1 handoff note', kind: 'handoff', revision: 1,
        excerpt: 'If Day 1 fills up, the Comet launch film may move to Day 2; Aurora and Beacon hold their Day 1 dates.',
        updatedAt: '2026-10-15T07:40:00.000Z',
      },
    ],
    campaigns: [
      { id: 'cp-a', name: 'Aurora Skincare Launch', brand: 'Aurora', creatorId: 'cr-mia', ownerId: 'p-am', sourceId: 'src-brief-a', category: 'Skincare', color: '#b4634a' },
      { id: 'cp-b', name: 'Beacon Fitness Challenge', brand: 'Beacon Active', creatorId: 'cr-ode', ownerId: 'p-am', sourceId: 'src-brief-b', category: 'Fitness', color: '#7c8c6f' },
      { id: 'cp-c', name: 'Comet Coffee Launch Film', brand: 'Comet Roasters', creatorId: 'cr-ta', ownerId: 'p-am', sourceId: 'src-brief-c', category: 'Food & Drink', color: '#c89b5a' },
    ],
    commitments: [
      { id: 'cm-a', campaignId: 'cp-a', title: 'Aurora launch edit', hours: 4, releaseDay: 1, deadlineDay: 1, flexUntilDay: 1, status: 'committed' },
      { id: 'cm-b', campaignId: 'cp-b', title: 'Beacon challenge edit', hours: 4, releaseDay: 1, deadlineDay: 1, flexUntilDay: 1, status: 'committed' },
      { id: 'cm-c', campaignId: 'cp-c', title: 'Comet launch film edit', hours: 4, releaseDay: 1, deadlineDay: 1, flexUntilDay: 2, status: 'committed' },
    ],
    editors: [
      { id: 'ed-alex', name: 'Alex Rivera', initials: 'AR', slots: Array.from({ length: 16 }, (_, i) => i), sourceId: 'src-cal' },
      { id: 'ed-sam', name: 'Sam Ashby', initials: 'SA', slots: [0, 1, 2, 3], sourceId: 'src-cal' },
    ],
    approvals: [
      { id: 'ap-a-alex', campaignId: 'cp-a', editorId: 'ed-alex', approved: true, sourceId: 'src-policy' },
      { id: 'ap-b-alex', campaignId: 'cp-b', editorId: 'ed-alex', approved: true, sourceId: 'src-policy' },
      { id: 'ap-c-alex', campaignId: 'cp-c', editorId: 'ed-alex', approved: true, sourceId: 'src-policy' },
      { id: 'ap-c-sam', campaignId: 'cp-c', editorId: 'ed-sam', approved: false, sourceId: 'src-policy' },
    ],
    events: [
      { id: 'ev-kickoff', campaignId: 'cp-c', creatorId: 'cr-ta', title: 'Comet kickoff review', start: 0, end: 1, sourceId: 'src-brief-c' },
      { id: 'ev-brand', campaignId: 'cp-a', creatorId: 'cr-mia', title: 'Aurora brand review', start: 20, end: 22, sourceId: 'src-brief-a' },
    ],
    proposals: [],
    decisions: [],
    activity: [
      {
        id: 'act-1', role: 'system',
        text: 'Imported Morrow Studio handoff: three Day 1 edits, two editors, one approval policy.',
        createdAt: '2026-10-15T07:45:00.000Z',
        sourceIds: ['src-handoff', 'src-policy'],
      },
    ],
  };
}
