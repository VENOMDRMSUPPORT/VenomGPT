/**
 * boardLinkStore.ts — In-memory registry mapping agentTaskId → boardTaskId.
 *
 * Used to thread the boardTaskId through to agentLoop plan persistence
 * without changing the runAgentTask function signature.
 *
 * Sequencing guarantee:
 *   runAgentTask fires off an IIFE that hits its first await at runPlanningPhase.
 *   Before that model call resolves, agent.ts synchronously calls registerBoardLink.
 *   So by the time agentLoop calls savePlanArtifact, the boardTaskId is registered.
 */

const _map = new Map<string, string>();

export function registerBoardLink(agentTaskId: string, boardTaskId: string): void {
  _map.set(agentTaskId, boardTaskId);
}

export function getBoardTaskId(agentTaskId: string): string | undefined {
  return _map.get(agentTaskId);
}

export function clearBoardLink(agentTaskId: string): void {
  _map.delete(agentTaskId);
}
