import { v } from 'convex/values';
import { mutation, query } from './_generated/server';
import { simulationStateSchema, type SimulationState, type WorldSpec } from '../shared/harness';

function createInitialAgentState(index: number) {
  return {
    satisfaction: 50,
    trust: 50,
    stress: 35 + Math.min(index * 4, 25),
    influence: 45 + Math.min(index * 5, 30),
  };
}

function compileWorldSpec(
  scenarioId: string,
  worldSpec: WorldSpec,
  activeInterventionId: string,
): SimulationState {
  const activeIntervention = worldSpec.interventions.find(
    (intervention) => intervention.id === activeInterventionId,
  );
  if (!activeIntervention) {
    throw new Error(`Unknown activeInterventionId: ${activeInterventionId}`);
  }

  const zonesById = new Map(worldSpec.zones.map((zone) => [zone.id, zone]));
  const agents = worldSpec.stakeholders.map((stakeholder, index) => {
    const zone = zonesById.get(stakeholder.startZoneId);
    if (!zone) {
      throw new Error(`Cannot place stakeholder ${stakeholder.id}: missing zone ${stakeholder.startZoneId}`);
    }
    return {
      id: stakeholder.id,
      name: stakeholder.name,
      role: stakeholder.role,
      goal: stakeholder.goal,
      concerns: stakeholder.concerns,
      zoneId: zone.id,
      x: zone.x,
      y: zone.y,
      state: createInitialAgentState(index),
    };
  });

  const simulationState: SimulationState = {
    scenarioId,
    tick: 0,
    status: 'compiled',
    zones: worldSpec.zones.map((zone) => ({
      id: zone.id,
      name: zone.name,
      purpose: zone.purpose,
      x: zone.x,
      y: zone.y,
    })),
    agents,
    metrics: worldSpec.metrics.map((metric) => ({
      id: metric.id,
      name: metric.name,
      direction: metric.direction,
      value: metric.initialValue,
    })),
    activeInterventionId,
    eventQueue: [
      {
        id: `EVT-initial-${activeIntervention.id}`,
        tick: 1,
        type: 'intervention_introduced',
        targetAgentIds: activeIntervention.affectedStakeholderIds,
        payload: {
          interventionId: activeIntervention.id,
          interventionName: activeIntervention.name,
          description: activeIntervention.description,
        },
      },
    ],
  };

  return simulationStateSchema.parse(simulationState);
}

export const compileScenario = mutation({
  args: {
    scenarioId: v.id('scenarios'),
    activeInterventionId: v.string(),
  },
  handler: async (ctx, args) => {
    const scenario = await ctx.db.get(args.scenarioId);
    if (!scenario) {
      throw new Error(`Scenario not found: ${args.scenarioId}`);
    }

    const latestSpec = await ctx.db
      .query('worldSpecs')
      .withIndex('scenarioId', (q) => q.eq('scenarioId', args.scenarioId))
      .order('desc')
      .first();
    if (!latestSpec || latestSpec.status !== 'valid' || !latestSpec.validatedSpec) {
      throw new Error(`Scenario requires a valid WorldSpec before compilation: ${args.scenarioId}`);
    }

    const existingState = await ctx.db
      .query('simulationStates')
      .withIndex('scenarioId', (q) => q.eq('scenarioId', args.scenarioId))
      .first();
    if (existingState) {
      throw new Error(`Scenario is already compiled: ${args.scenarioId}`);
    }

    const simulationState = compileWorldSpec(
      args.scenarioId,
      latestSpec.validatedSpec as WorldSpec,
      args.activeInterventionId,
    );
    const now = Date.now();
    const simulationStateId = await ctx.db.insert('simulationStates', {
      scenarioId: args.scenarioId,
      tick: simulationState.tick,
      status: simulationState.status,
      zones: simulationState.zones,
      agents: simulationState.agents,
      metrics: simulationState.metrics,
      activeInterventionId: simulationState.activeInterventionId,
      eventQueue: simulationState.eventQueue,
      createdAt: now,
      updatedAt: now,
    });

    await ctx.db.patch(args.scenarioId, {
      status: 'compiled',
      updatedAt: now,
    });

    return {
      simulationStateId,
      status: simulationState.status,
      agentCount: simulationState.agents.length,
      metricCount: simulationState.metrics.length,
      zoneCount: simulationState.zones.length,
      initialTick: simulationState.tick,
      activeInterventionId: simulationState.activeInterventionId,
      queuedEventCount: simulationState.eventQueue.length,
    };
  },
});

export const latestState = query({
  args: {
    scenarioId: v.id('scenarios'),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query('simulationStates')
      .withIndex('scenarioId', (q) => q.eq('scenarioId', args.scenarioId))
      .order('desc')
      .first();
  },
});
