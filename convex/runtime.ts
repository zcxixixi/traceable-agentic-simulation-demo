import { v } from 'convex/values';
import { mutation } from './_generated/server';
import { type SimulationState, simulationStateSchema } from '../shared/harness';

type RuntimeAgent = SimulationState['agents'][number];
type RuntimeMetric = SimulationState['metrics'][number];
type RuntimeEvent = SimulationState['eventQueue'][number];

function clampMetric(value: number) {
  return Math.max(0, Math.min(100, value));
}

function metricDeltaForAgent(agent: RuntimeAgent, event: RuntimeEvent): Record<string, number> {
  if (event.type !== 'intervention_introduced') {
    return {};
  }

  const interventionId =
    typeof event.payload === 'object' && event.payload && 'interventionId' in event.payload
      ? String(event.payload.interventionId)
      : '';
  if (interventionId !== 'replace-exams') {
    return {
      fairness: 2,
      workload: 2,
      'admissions-trust': 1,
    };
  }

  switch (agent.id) {
    case 'student':
      return { fairness: -4, 'gaming-risk': 5 };
    case 'parent':
      return { fairness: -3, 'admissions-trust': -4 };
    case 'teacher':
      return { workload: 8, fairness: 2 };
    case 'principal':
      return { workload: 3, 'admissions-trust': -2 };
    case 'admissions-officer':
      return { 'admissions-trust': -6, fairness: -2 };
    case 'tutoring-owner':
      return { 'gaming-risk': 7 };
    default:
      return {};
  }
}

function updateAgentForEvent(agent: RuntimeAgent, event: RuntimeEvent): RuntimeAgent {
  if (!event.targetAgentIds.includes(agent.id)) {
    return agent;
  }

  const stressIncrease = event.type === 'intervention_introduced' ? 8 : 3;
  const trustDelta =
    agent.id === 'teacher' || agent.id === 'principal' ? -2 : agent.id === 'tutoring-owner' ? 3 : -4;
  return {
    ...agent,
    state: {
      ...agent.state,
      stress: clampMetric(agent.state.stress + stressIncrease),
      trust: clampMetric(agent.state.trust + trustDelta),
      satisfaction: clampMetric(agent.state.satisfaction - 2),
    },
  };
}

function applyMetricDeltas(metrics: RuntimeMetric[], deltas: Record<string, number>) {
  return metrics.map((metric) => ({
    ...metric,
    value: clampMetric(metric.value + (deltas[metric.id] ?? 0)),
  }));
}

function mergeDeltas(items: Array<Record<string, number>>) {
  const merged: Record<string, number> = {};
  for (const item of items) {
    for (const [key, value] of Object.entries(item)) {
      merged[key] = (merged[key] ?? 0) + value;
    }
  }
  return merged;
}

export const runStep = mutation({
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
      throw new Error(`Scenario must be compiled before runtime can run: ${args.scenarioId}`);
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
    if (state.status === 'completed') {
      throw new Error(`Scenario is already completed: ${args.scenarioId}`);
    }

    const nextTick = state.tick + 1;
    const dueEvents = state.eventQueue.filter((event) => event.tick <= nextTick);
    const remainingEvents = state.eventQueue.filter((event) => event.tick > nextTick);
    if (dueEvents.length === 0) {
      await ctx.db.patch(stateDoc._id, {
        tick: nextTick,
        status: 'running',
        updatedAt: Date.now(),
      });
      await ctx.db.patch(args.scenarioId, {
        status: 'running',
        updatedAt: Date.now(),
      });
      return {
        tick: nextTick,
        processedEventCount: 0,
        traceEventCount: 0,
        status: 'running',
      };
    }

    let agents = state.agents;
    let metrics = state.metrics;
    const traceEvents = [];

    for (const event of dueEvents) {
      const targetAgents = agents.filter((agent) => event.targetAgentIds.includes(agent.id));
      const perAgentDeltas = targetAgents.map((agent) => metricDeltaForAgent(agent, event));
      const mergedDeltas = mergeDeltas(perAgentDeltas);
      const stateBefore = {
        tick: state.tick,
        metrics,
        agents: targetAgents.map((agent) => ({
          id: agent.id,
          state: agent.state,
        })),
      };

      agents = agents.map((agent) => updateAgentForEvent(agent, event));
      metrics = applyMetricDeltas(metrics, mergedDeltas);

      for (const agent of targetAgents) {
        const updatedAgent = agents.find((candidate) => candidate.id === agent.id)!;
        const metricDeltas = metricDeltaForAgent(agent, event);
        const traceEvent = {
          id: `TE-${event.id}-${agent.id}-${nextTick}`,
          tick: nextTick,
          scenarioId: args.scenarioId,
          actorId: agent.id,
          actionType: event.type,
          actionPayload: event.payload,
          reason: `${agent.name} reacts to the active intervention because it affects their role: ${agent.role}.`,
          evidenceIds: ['EV1', 'EV2', 'EV3'].filter((_, index) => index < 1 + (agent.id === 'teacher' ? 2 : 0)),
          assumptionIds: ['A1', 'A2', 'A3'].filter((_, index) => index < 1 + (agent.id === 'teacher' ? 2 : 0)),
          stateBefore: {
            agent: {
              id: agent.id,
              state: agent.state,
            },
          },
          stateAfter: {
            agent: {
              id: updatedAgent.id,
              state: updatedAgent.state,
            },
          },
          metricDeltas,
        };
        traceEvents.push(traceEvent);
        await ctx.db.insert('traceEvents', {
          scenarioId: args.scenarioId,
          eventId: traceEvent.id,
          tick: traceEvent.tick,
          actorId: traceEvent.actorId,
          actionType: traceEvent.actionType,
          actionPayload: traceEvent.actionPayload,
          reason: traceEvent.reason,
          evidenceIds: traceEvent.evidenceIds,
          assumptionIds: traceEvent.assumptionIds,
          stateBefore: traceEvent.stateBefore,
          stateAfter: traceEvent.stateAfter,
          metricDeltas: traceEvent.metricDeltas,
          createdAt: Date.now(),
        });
      }

      void stateBefore;
    }

    const newStatus = remainingEvents.length === 0 ? 'completed' : 'running';
    await ctx.db.patch(stateDoc._id, {
      tick: nextTick,
      status: newStatus,
      agents,
      metrics,
      eventQueue: remainingEvents,
      updatedAt: Date.now(),
    });
    await ctx.db.patch(args.scenarioId, {
      status: newStatus,
      updatedAt: Date.now(),
    });

    return {
      tick: nextTick,
      processedEventCount: dueEvents.length,
      traceEventCount: traceEvents.length,
      status: newStatus,
      metricSummary: metrics.map((metric) => ({
        id: metric.id,
        value: metric.value,
      })),
    };
  },
});
