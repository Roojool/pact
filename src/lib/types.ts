export type Day = 1 | 2;
export interface Creator { id: string; name: string; handle: string; category: string; initials: string; color: string }
export interface Person { id: string; name: string; role: string }
export interface Source { id: string; title: string; kind: 'brief' | 'policy' | 'calendar' | 'handoff'; revision: number; excerpt: string; updatedAt: string }
export interface Campaign { id: string; name: string; brand: string; creatorId: string; ownerId: string; sourceId: string; category: string; color: string }
export interface Commitment { id: string; campaignId: string; title: string; hours: number | null; releaseDay: Day; deadlineDay: Day; flexUntilDay: Day; status: 'proposed' | 'committed' }
/** Slots 0..7 are Day 1 09:00–17:00; 8..15 are Day 2 09:00–17:00. */
export interface Editor { id: string; name: string; initials: string; slots: number[]; sourceId: string }
export interface Approval { id: string; campaignId: string; editorId: string; approved: boolean; sourceId: string }
/** Event times are integer hours from the start of Day 1, end exclusive. */
export interface AgencyEvent { id: string; campaignId: string; creatorId: string; title: string; start: number; end: number; sourceId: string }
export interface Allocation { commitmentId: string; editorId: string; slots: number[] }
export interface EvidencePath { id: string; labels: string[]; nodeIds: string[]; sourceIds: string[]; explanation: string }
export interface CheckResult { status: 'feasible' | 'infeasible' | 'needs_information' | 'search_limit'; summary: string; requiredHours: number; availableHours: number; conflictIds: string[]; issues: string[]; allocations: Allocation[]; evidence: EvidencePath[]; assumptions: string[] }
export interface PlanChange { commitmentId: string; deadlineDay?: Day; editorId?: string }
export interface Proposal { id: string; title: string; description: string; revision: number; changes: PlanChange[]; result: CheckResult; status: 'proposed' | 'approved' | 'rejected'; createdAt: string; sourceVersions: Record<string, number> }
export interface OwnerTask { id: string; ownerId: string; title: string; status: 'todo' | 'done' }
export interface Decision { id: string; proposalId: string; title: string; revision: number; createdAt: string; idempotencyKey: string; allocations: Allocation[]; tasks: OwnerTask[]; sourceVersions: Record<string, number>; note: string }
export interface Activity { id: string; role: 'account_manager' | 'producer' | 'system'; text: string; createdAt: string; sourceIds: string[] }
export interface Workspace { id: string; agency: string; kind?: 'sample' | 'custom'; revision: number; creators: Creator[]; people: Person[]; sources: Source[]; campaigns: Campaign[]; commitments: Commitment[]; editors: Editor[]; approvals: Approval[]; events: AgencyEvent[]; proposals: Proposal[]; decisions: Decision[]; activity: Activity[] }
export interface Analysis { check: CheckResult; proposals: Proposal[]; activity: Activity[]; mode: 'deterministic' | 'live'; model?: string; usageUsd?: number; warning?: string }
export interface AgentReply { text: string; activity: Activity[]; sourceIds: string[]; mode: 'deterministic' | 'live'; warning?: string; usageUsd?: number }
export type WorkspaceEdit =
  | { kind: 'commitment'; id: string; hours?: number | null; deadlineDay?: Day }
  | { kind: 'approval'; id: string; approved: boolean }
  | { kind: 'permission'; campaignId: string; editorId: string; approved: boolean }
  | { kind: 'editor'; id: string; slots: number[] }
  | { kind: 'event'; id: string; start: number; end: number };
