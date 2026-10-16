import type { Analysis, Workspace } from './types';

/** A view of the current check, never a prediction or a candidate's result. */
export function dashboardState(workspace: Workspace, analysis: Analysis | null) {
  const decision = workspace.decisions.find(d => d.revision + 1 === workspace.revision);
  const status = analysis?.check.status ?? (decision ? 'saved' : workspace.decisions.length ? 'changed' : 'unchecked');
  const knownHours = workspace.commitments.reduce((sum, job) => sum + (job.hours ?? 0), 0);
  return {
    status,
    decision,
    knownHours,
    unknownHours: workspace.commitments.some(job => job.hours === null),
    affected: new Set(analysis?.check.conflictIds ?? []),
    readyOptions: analysis?.proposals.filter(p => p.status === 'proposed' && p.result.status === 'feasible').length ?? 0,
  };
}
