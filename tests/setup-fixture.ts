import type { SetupDraft } from '../src/lib/business-setup';
export function setupFixture(): SetupDraft {
  return {
    businessType: 'creative_agency', companyName: 'Sunroom Studio', ownerName: 'Asha', suggestions: [],
    editors: [{ name: 'Neha', slots: Array.from({ length: 16 }, (_, i) => i), evidence: '' }, { name: 'Rohan', slots: [0, 1, 2, 3], evidence: '' }],
    jobs: ['Aurora', 'Beacon', 'Comet'].map((client, i) => ({ client, title: `${client} edit`, hours: 4, deadlineDay: 1, flexUntilDay: i === 2 ? 2 : 1, evidence: '' })),
    permissions: [0, 1, 2].flatMap(jobIndex => [{ editorIndex: 0, jobIndex, state: 'approved' as const, evidence: '' }, { editorIndex: 1, jobIndex, state: 'denied' as const, evidence: '' }]),
  };
}
