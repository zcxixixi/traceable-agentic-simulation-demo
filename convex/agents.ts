import { v } from 'convex/values';
import { mutation, query } from './_generated/server';
import {
  agentDecisionSchema,
  simulationStateSchema,
  type AgentDecision,
  type SimulationState,
} from '../shared/harness';

type RuntimeAgent = SimulationState['agents'][number];
type RuntimeEvent = SimulationState['eventQueue'][number] | undefined;

const AGENT_GROUNDING: Record<
  string,
  {
    evidenceIds: string[];
    assumptionIds: string[];
    confidence: AgentDecision['confidence'];
    actionType: string;
    metricEffects: Record<string, number>;
  }
> = {
  student: {
    evidenceIds: ['EV2'],
    assumptionIds: ['A2'],
    confidence: 'medium',
    actionType: 'raise_fairness_concern',
    metricEffects: { fairness: -2, 'gaming-risk': 1 },
  },
  parent: {
    evidenceIds: ['EV1', 'EV2'],
    assumptionIds: ['A1', 'A2'],
    confidence: 'medium',
    actionType: 'question_admissions_trust',
    metricEffects: { fairness: -1, 'admissions-trust': -2 },
  },
  teacher: {
    evidenceIds: ['EV3'],
    assumptionIds: ['A3'],
    confidence: 'high',
    actionType: 'raise_workload_concern',
    metricEffects: { workload: 3, fairness: 1 },
  },
  principal: {
    evidenceIds: ['EV1', 'EV3'],
    assumptionIds: ['A1', 'A3'],
    confidence: 'medium',
    actionType: 'request_implementation_guardrails',
    metricEffects: { workload: 1, 'admissions-trust': -1 },
  },
  'admissions-officer': {
    evidenceIds: ['EV1'],
    assumptionIds: ['A1'],
    confidence: 'high',
    actionType: 'challenge_signal_comparability',
    metricEffects: { fairness: -1, 'admissions-trust': -3 },
  },
  'tutoring-owner': {
    evidenceIds: ['EV2'],
    assumptionIds: ['A2'],
    confidence: 'medium',
    actionType: 'adapt_tutoring_services',
    metricEffects: { 'gaming-risk': 3 },
  },
};

function extractInterventionId(event: RuntimeEvent, fallback: string) {
  if (
    typeof event?.payload === 'object' &&
    event.payload &&
    'interventionId' in event.payload &&
    typeof event.payload.interventionId === 'string'
  ) {
    return event.payload.interventionId;
  }
  return fallback;
}

function buildObservation(agent: RuntimeAgent, state: SimulationState, event: RuntimeEvent) {
  const eventText = event
    ? `next event "${event.type}" targets ${event.targetAgentIds.join(', ')}`
    : 'no queued event';
  return `${agent.name} is in ${agent.zoneId}; trust=${agent.state.trust}, stress=${agent.state.stress}; ${eventText}.`;
}

function buildDecision(
  scenarioId: string,
  state: SimulationState,
  agent: RuntimeAgent,
  event: RuntimeEvent,
): AgentDecision {
  const grounding = AGENT_GROUNDING[agent.id] ?? {
    evidenceIds: ['EV1'],
    assumptionIds: ['A1'],
    confidence: 'low' as const,
    actionType: 'monitor_intervention',
    metricEffects: {},
  };
  const interventionId = extractInterventionId(event, state.activeInterventionId);
  const metricIds = Object.keys(grounding.metricEffects);

  return agentDecisionSchema.parse({
    id: `AD-${scenarioId}-${state.tick}-${agent.id}`,
    scenarioId,
    tick: state.tick,
    agentId: agent.id,
    observation: buildObservation(agent, state, event),
    retrievedEvidenceIds: grounding.evidenceIds,
    retrievedAssumptionIds: grounding.assumptionIds,
    proposedAction: {
      type: grounding.actionType,
      targetIds: [interventionId, ...metricIds],
      payload: {
        agentRole: agent.role,
        goal: agent.goal,
        primaryConcern: agent.concerns[0],
        interventionId,
      },
      metricEffects: grounding.metricEffects,
    },
    reason: `${agent.name} chooses ${grounding.actionType} because their goal is "${agent.goal}" and the current intervention touches "${agent.concerns[0]}".`,
    confidence: grounding.confidence,
  });
}

async function validateDecisionReferences(ctx: any, scenarioId: any, state: SimulationState, decision: AgentDecision) {
  const agentIds = new Set(state.agents.map((agent) => agent.id));
  if (!agentIds.has(decision.agentId)) {
    throw new Error(`Agent decision references unknown agent: ${decision.agentId}`);
  }

  const metricIds = new Set(state.metrics.map((metric) => metric.id));
  for (const metricId of Object.keys(decision.proposedAction.metricEffects)) {
    if (!metricIds.has(metricId)) {
      throw new Error(`Agent decision references unknown metric: ${metricId}`);
    }
  }

  const evidenceRows = await ctx.db
    .query('evidenceCards')
    .withIndex('scenarioId', (q: any) => q.eq('scenarioId', scenarioId))
    .collect();
  const evidenceIds = new Set(evidenceRows.map((row: any) => row.evidenceId));
  for (const evidenceId of decision.retrievedEvidenceIds) {
    if (!evidenceIds.has(evidenceId)) {
      throw new Error(`Agent decision references unknown evidence: ${evidenceId}`);
    }
  }

  const assumptionRows = await ctx.db
    .query('assumptions')
    .withIndex('scenarioId', (q: any) => q.eq('scenarioId', scenarioId))
    .collect();
  const assumptionIds = new Set(assumptionRows.map((row: any) => row.assumptionId));
  for (const assumptionId of decision.retrievedAssumptionIds) {
    if (!assumptionIds.has(assumptionId)) {
      throw new Error(`Agent decision references unknown assumption: ${assumptionId}`);
    }
  }
}

export const decideForScenario = mutation({
  args: {
    scenarioId: v.id('scenarios'),
  },
  handler: async (ctx, args) => {
    const scenario = await ctx.db.get(args.scenarioId);
    if (!scenario) {
      throw new Error(`Scenario not found: ${args.scenarioId}`);
    }

    const stateDoc = await ctx.db
      .query('simulationStates')
      .withIndex('scenarioId', (q) => q.eq('scenarioId', args.scenarioId))
      .order('desc')
      .first();
    if (!stateDoc) {
      throw new Error(`Scenario must be compiled before agents can decide: ${args.scenarioId}`);
    }

    const state = simulationStateSchema.parse({
      scenarioId: stateDoc.scenarioId,
      tick: stateDoc.tick,
      status: stateDoc.status,
      zones: stateDoc.zones,
      agents: stateDoc.agents,
      metrics: stateDoc.metrics,
      activeInterventionId: stateDoc.activeInterventionId,
      eventQueue: stateDoc.eventQueue,
    });
    const nextEvent = [...state.eventQueue].sort((a, b) => a.tick - b.tick)[0];
    const targetAgentIds = new Set(nextEvent?.targetAgentIds ?? state.agents.map((agent) => agent.id));
    const targetAgents = state.agents.filter((agent) => targetAgentIds.has(agent.id));
    const decisions = targetAgents.map((agent) => buildDecision(args.scenarioId, state, agent, nextEvent));

    for (const decision of decisions) {
      await validateDecisionReferences(ctx, args.scenarioId, state, decision);
    }

    const now = Date.now();
    for (const decision of decisions) {
      await ctx.db.insert('agentDecisions', {
        scenarioId: args.scenarioId,
        decisionId: decision.id,
        tick: decision.tick,
        agentId: decision.agentId,
        observation: decision.observation,
        retrievedEvidenceIds: decision.retrievedEvidenceIds,
        retrievedAssumptionIds: decision.retrievedAssumptionIds,
        proposedAction: decision.proposedAction,
        reason: decision.reason,
        confidence: decision.confidence,
        createdAt: now,
      });
    }

    return {
      tick: state.tick,
      decisionCount: decisions.length,
      decisions,
    };
  },
});

export const saveValidatedDecisions = mutation({
  args: {
    scenarioId: v.id('scenarios'),
    decisions: v.array(v.any()),
  },
  handler: async (ctx, args) => {
    const scenario = await ctx.db.get(args.scenarioId);
    if (!scenario) {
      throw new Error(`Scenario not found: ${args.scenarioId}`);
    }

    const stateDoc = await ctx.db
      .query('simulationStates')
      .withIndex('scenarioId', (q) => q.eq('scenarioId', args.scenarioId))
      .order('desc')
      .first();
    if (!stateDoc) {
      throw new Error(`Scenario must be compiled before agent decisions can be saved: ${args.scenarioId}`);
    }

    const state = simulationStateSchema.parse({
      scenarioId: stateDoc.scenarioId,
      tick: stateDoc.tick,
      status: stateDoc.status,
      zones: stateDoc.zones,
      agents: stateDoc.agents,
      metrics: stateDoc.metrics,
      activeInterventionId: stateDoc.activeInterventionId,
      eventQueue: stateDoc.eventQueue,
    });
    const decisions = args.decisions.map((decision) => agentDecisionSchema.parse(decision));

    for (const decision of decisions) {
      if (decision.scenarioId !== args.scenarioId) {
        throw new Error(`Agent decision scenario mismatch: ${decision.scenarioId}`);
      }
      if (decision.tick !== state.tick) {
        throw new Error(`Agent decision tick mismatch: expected ${state.tick}, got ${decision.tick}`);
      }
      await validateDecisionReferences(ctx, args.scenarioId, state, decision);
    }

    const now = Date.now();
    const decisionIds = [];
    for (const decision of decisions) {
      const decisionDocId = await ctx.db.insert('agentDecisions', {
        scenarioId: args.scenarioId,
        decisionId: decision.id,
        tick: decision.tick,
        agentId: decision.agentId,
        observation: decision.observation,
        retrievedEvidenceIds: decision.retrievedEvidenceIds,
        retrievedAssumptionIds: decision.retrievedAssumptionIds,
        proposedAction: decision.proposedAction,
        reason: decision.reason,
        confidence: decision.confidence,
        createdAt: now,
      });
      decisionIds.push(decisionDocId);
    }

    return {
      savedCount: decisionIds.length,
      decisionIds,
    };
  },
});

export const listForScenario = query({
  args: {
    scenarioId: v.id('scenarios'),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query('agentDecisions')
      .withIndex('scenarioId_tick', (q) => q.eq('scenarioId', args.scenarioId))
      .collect();
  },
});
