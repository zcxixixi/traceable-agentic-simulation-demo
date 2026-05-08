import { v } from 'convex/values';
import { api } from './_generated/api';
import { action, mutation, query } from './_generated/server';

type Confidence = 'low' | 'medium' | 'high';

type LiveAgent = {
  _id: any;
  agentId: string;
  name: string;
  role: string;
  goals: string[];
  concerns: string[];
  locationZoneId: string;
  currentAction?: string;
  status: 'idle' | 'moving' | 'talking' | 'working' | 'waiting';
  state: {
    satisfaction: number;
    trust: number;
    stress: number;
    influence: number;
  };
};

type LiveWorld = {
  _id: any;
  scenarioId: any;
  tick: number;
  zones: Array<{ id: string; name: string; purpose: string; x: number; y: number }>;
  metrics: Array<{ id: string; name: string; direction: string; value: number }>;
  activeInterventionId: string;
  globalFacts: string[];
};

type RetrievedContext = {
  memoryIds: any[];
  memoryTexts: string[];
  evidenceIds: string[];
  assumptionIds: string[];
};

type TickDecision = {
  decisionId: string;
  action: {
    type: string;
    targetZoneId?: string;
    targetAgentId?: string;
    message?: string;
    metricEffects: Record<string, number>;
  };
  reason: string;
  confidence: Confidence;
};

type DecisionProvider = 'deterministic' | 'llm';

const policyByAgent: Record<
  string,
  {
    actionType: string;
    targetZoneId: string;
    status: LiveAgent['status'];
    confidence: Confidence;
    metricEffects: Record<string, number>;
  }
> = {
  student: {
    actionType: 'ask_for_fair_support',
    targetZoneId: 'principal-office',
    status: 'talking',
    confidence: 'medium',
    metricEffects: { fairness: -1, 'gaming-risk': 1 },
  },
  parent: {
    actionType: 'challenge_project_authenticity',
    targetZoneId: 'principal-office',
    status: 'talking',
    confidence: 'medium',
    metricEffects: { fairness: -1, 'admissions-trust': -1 },
  },
  teacher: {
    actionType: 'request_rubric_and_feedback_tools',
    targetZoneId: 'principal-office',
    status: 'working',
    confidence: 'high',
    metricEffects: { workload: 2, fairness: 1 },
  },
  principal: {
    actionType: 'coordinate_guardrail_plan',
    targetZoneId: 'teacher-office',
    status: 'working',
    confidence: 'medium',
    metricEffects: { workload: 1, fairness: 1 },
  },
  'admissions-officer': {
    actionType: 'demand_comparable_portfolio_signal',
    targetZoneId: 'admissions-office',
    status: 'working',
    confidence: 'high',
    metricEffects: { 'admissions-trust': -2, fairness: -1 },
  },
  'tutoring-owner': {
    actionType: 'package_project_coaching_service',
    targetZoneId: 'tutoring-street',
    status: 'working',
    confidence: 'medium',
    metricEffects: { 'gaming-risk': 2 },
  },
};

function clamp(value: number) {
  return Math.max(0, Math.min(100, value));
}

function extractAgentState(input: any, index: number) {
  return {
    satisfaction: clamp(Number(input?.satisfaction ?? 50)),
    trust: clamp(Number(input?.trust ?? 50)),
    stress: clamp(Number(input?.stress ?? 35 + index * 4)),
    influence: clamp(Number(input?.influence ?? 45 + index * 5)),
  };
}

function observe(world: LiveWorld, agent: LiveAgent, recentEvents: any[]) {
  const localEvents = recentEvents
    .filter((event) => event.visibleToAgentIds.includes(agent.agentId) || event.actorAgentId === agent.agentId)
    .slice(-3)
    .map((event) => `${event.type} at tick ${event.tick}`);
  const metrics = world.metrics.map((metric) => `${metric.id}=${metric.value}`).join(', ');
  const eventText = localEvents.length > 0 ? localEvents.join('; ') : 'no visible recent events';

  return `${agent.name} observes tick ${world.tick} from ${agent.locationZoneId}; metrics: ${metrics}; recent events: ${eventText}.`;
}

async function retrieveContext(ctx: any, world: LiveWorld, agent: LiveAgent): Promise<RetrievedContext> {
  const memories = await ctx.db
    .query('agentMemories')
    .withIndex('worldId_agentId', (q: any) => q.eq('worldId', world._id).eq('agentId', agent.agentId))
    .order('desc')
    .take(4);
  const evidenceRows = await ctx.db
    .query('evidenceCards')
    .withIndex('scenarioId', (q: any) => q.eq('scenarioId', world.scenarioId))
    .take(3);
  const assumptionRows = await ctx.db
    .query('assumptions')
    .withIndex('scenarioId', (q: any) => q.eq('scenarioId', world.scenarioId))
    .take(3);

  return {
    memoryIds: memories.map((memory: any) => memory._id),
    memoryTexts: memories.map((memory: any) => memory.text),
    evidenceIds: evidenceRows.map((evidence: any) => evidence.evidenceId),
    assumptionIds: assumptionRows.map((assumption: any) => assumption.assumptionId),
  };
}

function decideDeterministically(world: LiveWorld, agent: LiveAgent, context: RetrievedContext): TickDecision {
  const policy = policyByAgent[agent.agentId] ?? {
    actionType: 'monitor_world_state',
    targetZoneId: agent.locationZoneId,
    status: 'waiting' as const,
    confidence: 'low' as const,
    metricEffects: {},
  };
  const memoryClause =
    context.memoryTexts.length > 0
      ? ` It also remembers: ${context.memoryTexts[0]}`
      : ' It has no prior memory yet.';

  return {
    decisionId: `LAD-${world._id}-${world.tick + 1}-${agent.agentId}`,
    action: {
      type: policy.actionType,
      targetZoneId: policy.targetZoneId,
      message: `${agent.name} chooses ${policy.actionType}.`,
      metricEffects: policy.metricEffects,
    },
    reason: `${agent.name} acts toward "${agent.goals[0]}" while watching "${agent.concerns[0]}".${memoryClause}`,
    confidence: policy.confidence,
  };
}

function decideWithProvider(
  provider: DecisionProvider,
  world: LiveWorld,
  agent: LiveAgent,
  context: RetrievedContext,
): TickDecision {
  if (provider === 'llm') {
    // The loop keeps LLM behind this boundary. V1 intentionally uses deterministic
    // decisions until the live town UI proves the state/trace pipeline is stable.
    return decideDeterministically(world, agent, context);
  }
  return decideDeterministically(world, agent, context);
}

export const startEducationReformTown = action({
  args: {
    question: v.optional(v.string()),
    maxTicks: v.optional(v.number()),
    tickIntervalMs: v.optional(v.number()),
    decisionProvider: v.optional(v.union(v.literal('deterministic'), v.literal('llm'))),
  },
  handler: async (
    ctx,
    args,
  ): Promise<{
    scenarioId: string;
    worldId: string;
    runId: string;
  }> => {
    void args.question;
    void args.decisionProvider;

    const seeded: { scenarioId: any } = await ctx.runMutation(api.seed.educationReformScenario);
    await ctx.runMutation(api.compiler.compileScenario, {
      scenarioId: seeded.scenarioId,
      activeInterventionId: 'replace-exams',
    });
    const started: { worldId: any; runId: any } = await ctx.runMutation(api.simulationLoop.startFromCompiledScenario, {
      scenarioId: seeded.scenarioId,
      maxTicks: args.maxTicks,
      tickIntervalMs: args.tickIntervalMs,
      autoStart: true,
    });

    return {
      scenarioId: String(seeded.scenarioId),
      worldId: String(started.worldId),
      runId: String(started.runId),
    };
  },
});

function validateDecision(world: LiveWorld, agent: LiveAgent, decision: TickDecision) {
  const zoneIds = new Set(world.zones.map((zone) => zone.id));
  if (decision.action.targetZoneId && !zoneIds.has(decision.action.targetZoneId)) {
    throw new Error(`Decision ${decision.decisionId} references unknown zone ${decision.action.targetZoneId}`);
  }

  const metricIds = new Set(world.metrics.map((metric) => metric.id));
  for (const metricId of Object.keys(decision.action.metricEffects)) {
    if (!metricIds.has(metricId)) {
      throw new Error(`Decision ${decision.decisionId} references unknown metric ${metricId}`);
    }
  }

  if (!agent.agentId) {
    throw new Error(`Decision ${decision.decisionId} has no actor`);
  }
}

function applyMetricEffects(
  metrics: LiveWorld['metrics'],
  metricEffects: Record<string, number>,
) {
  return metrics.map((metric) => ({
    ...metric,
    value: clamp(metric.value + (metricEffects[metric.id] ?? 0)),
  }));
}

function applyAgentEffects(agent: LiveAgent, decision: TickDecision) {
  const stressDelta = decision.action.type.includes('request') || decision.action.type.includes('demand') ? 1 : 0;
  const trustDelta = decision.confidence === 'high' ? 1 : 0;
  return {
    locationZoneId: decision.action.targetZoneId ?? agent.locationZoneId,
    status: policyByAgent[agent.agentId]?.status ?? 'waiting',
    currentAction: decision.action.type,
    state: {
      ...agent.state,
      stress: clamp(agent.state.stress + stressDelta),
      trust: clamp(agent.state.trust + trustDelta),
    },
  };
}

export const startFromCompiledScenario = mutation({
  args: {
    scenarioId: v.id('scenarios'),
    maxTicks: v.optional(v.number()),
    tickIntervalMs: v.optional(v.number()),
    autoStart: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const scenario = await ctx.db.get(args.scenarioId);
    if (!scenario) {
      throw new Error(`Scenario not found: ${args.scenarioId}`);
    }

    const state = await ctx.db
      .query('simulationStates')
      .withIndex('scenarioId', (q) => q.eq('scenarioId', args.scenarioId))
      .order('desc')
      .first();
    if (!state) {
      throw new Error(`Scenario must be compiled before starting a real town loop: ${args.scenarioId}`);
    }

    const now = Date.now();
    const worldId = await ctx.db.insert('worlds', {
      scenarioId: args.scenarioId,
      sourceSimulationStateId: state._id,
      tick: state.tick,
      status: 'running',
      zones: state.zones,
      metrics: state.metrics,
      activeInterventionId: state.activeInterventionId,
      globalFacts: [`Active intervention: ${state.activeInterventionId}`],
      createdAt: now,
      updatedAt: now,
    });

    for (const [index, agent] of state.agents.entries()) {
      await ctx.db.insert('agents', {
        scenarioId: args.scenarioId,
        worldId,
        agentId: agent.id,
        name: agent.name,
        role: agent.role,
        goals: [agent.goal],
        concerns: agent.concerns,
        locationZoneId: agent.zoneId,
        currentAction: undefined,
        status: 'idle',
        state: extractAgentState(agent.state, index),
        lastDecisionId: undefined,
        createdAt: now,
        updatedAt: now,
      });
    }

    await ctx.db.insert('worldEvents', {
      scenarioId: args.scenarioId,
      worldId,
      tick: state.tick,
      actorAgentId: undefined,
      type: 'world_started',
      payload: { activeInterventionId: state.activeInterventionId },
      visibleToAgentIds: state.agents.map((agent: any) => agent.id),
      createdAt: now,
    });

    const runId = await ctx.db.insert('simulationRuns', {
      scenarioId: args.scenarioId,
      worldId,
      status: 'running',
      tick: state.tick,
      maxTicks: Math.max(1, Math.min(50, Math.floor(args.maxTicks ?? 6))),
      tickIntervalMs: Math.max(250, Math.min(60_000, Math.floor(args.tickIntervalMs ?? 2500))),
      startedAt: now,
      updatedAt: now,
    });

    if (args.autoStart !== false) {
      await ctx.scheduler.runAfter(0, api.simulationLoop.tickWorld, { runId });
    }
    return { runId, worldId, status: 'running', tick: state.tick };
  },
});

export const tickWorld = mutation({
  args: {
    runId: v.id('simulationRuns'),
    scheduleNext: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const run = await ctx.db.get(args.runId);
    if (!run) {
      throw new Error(`SimulationRun not found: ${args.runId}`);
    }
    if (run.status !== 'running') {
      return { status: run.status, tick: run.tick, processedAgentCount: 0 };
    }

    const world = (await ctx.db.get(run.worldId)) as LiveWorld | null;
    if (!world) {
      throw new Error(`World not found: ${run.worldId}`);
    }

    const agents = (await ctx.db
      .query('agents')
      .withIndex('worldId', (q) => q.eq('worldId', run.worldId))
      .collect()) as LiveAgent[];
    const recentEvents = await ctx.db
      .query('worldEvents')
      .withIndex('worldId_tick', (q) => q.eq('worldId', run.worldId))
      .order('desc')
      .take(12);

    const nextTick = world.tick + 1;
    let metrics = world.metrics;
    const now = Date.now();

    for (const agent of agents) {
      const observation = observe(world, agent, recentEvents);
      const context = await retrieveContext(ctx, world, agent);
      const decision = decideWithProvider('deterministic', world, agent, context);
      validateDecision(world, agent, decision);

      const before = {
        locationZoneId: agent.locationZoneId,
        status: agent.status,
        state: agent.state,
        metrics,
      };
      const patch = applyAgentEffects(agent, decision);
      metrics = applyMetricEffects(metrics, decision.action.metricEffects);

      const decisionDocId = await ctx.db.insert('agentDecisions', {
        scenarioId: run.scenarioId,
        worldId: run.worldId,
        runId: args.runId,
        decisionId: decision.decisionId,
        tick: nextTick,
        agentId: agent.agentId,
        observation,
        retrievedMemoryIds: context.memoryIds,
        retrievedEvidenceIds: context.evidenceIds,
        retrievedAssumptionIds: context.assumptionIds,
        proposedAction: {
          type: decision.action.type,
          targetIds: [
            decision.action.targetZoneId ?? agent.locationZoneId,
            ...Object.keys(decision.action.metricEffects),
          ],
          payload: {
            targetZoneId: decision.action.targetZoneId,
            targetAgentId: decision.action.targetAgentId,
            message: decision.action.message,
          },
          metricEffects: decision.action.metricEffects,
        },
        reason: decision.reason,
        confidence: decision.confidence,
        createdAt: now,
      });

      await ctx.db.patch(agent._id, {
        ...patch,
        lastDecisionId: decision.decisionId,
        updatedAt: now,
      });

      const memoryId = await ctx.db.insert('agentMemories', {
        scenarioId: run.scenarioId,
        worldId: run.worldId,
        agentDocId: agent._id,
        agentId: agent.agentId,
        tick: nextTick,
        type: 'decision',
        text: `${observation} Decision: ${decision.action.type}. Reason: ${decision.reason}`,
        importance: decision.confidence === 'high' ? 0.85 : 0.62,
        createdAt: now,
      });

      await ctx.db.insert('worldEvents', {
        scenarioId: run.scenarioId,
        worldId: run.worldId,
        tick: nextTick,
        actorAgentId: agent.agentId,
        type: decision.action.type,
        payload: {
          decisionId: decision.decisionId,
          targetZoneId: decision.action.targetZoneId,
          targetAgentId: decision.action.targetAgentId,
          message: decision.action.message,
          metricEffects: decision.action.metricEffects,
        },
        visibleToAgentIds: agents.map((candidate) => candidate.agentId),
        createdAt: now,
      });

      await ctx.db.insert('traceEvents', {
        scenarioId: run.scenarioId,
        worldId: run.worldId,
        runId: args.runId,
        eventId: `LTE-${decision.decisionId}`,
        tick: nextTick,
        actorId: agent.agentId,
        decisionId: String(decisionDocId),
        actionType: decision.action.type,
        actionPayload: {
          type: decision.action.type,
          payload: {
            targetZoneId: decision.action.targetZoneId,
            targetAgentId: decision.action.targetAgentId,
            message: decision.action.message,
          },
          metricEffects: decision.action.metricEffects,
        },
        reason: decision.reason,
        evidenceIds: context.evidenceIds,
        assumptionIds: context.assumptionIds,
        memoryIds: [...context.memoryIds, memoryId],
        stateBefore: before,
        stateAfter: {
          locationZoneId: patch.locationZoneId,
          status: patch.status,
          state: patch.state,
          metrics,
        },
        metricDeltas: decision.action.metricEffects,
        createdAt: now,
      });
    }

    const nextStatus = nextTick >= run.maxTicks ? 'completed' : 'running';
    await ctx.db.patch(run.worldId, {
      tick: nextTick,
      status: nextStatus,
      metrics,
      updatedAt: now,
    });
    await ctx.db.patch(args.runId, {
      tick: nextTick,
      status: nextStatus,
      updatedAt: now,
    });

    if (nextStatus === 'running' && args.scheduleNext !== false) {
      await ctx.scheduler.runAfter(run.tickIntervalMs, api.simulationLoop.tickWorld, { runId: args.runId });
    }

    return {
      status: nextStatus,
      tick: nextTick,
      processedAgentCount: agents.length,
      metricSummary: metrics.map((metric) => ({ id: metric.id, value: metric.value })),
    };
  },
});

export const getRunSnapshot = query({
  args: {
    runId: v.id('simulationRuns'),
  },
  handler: async (ctx, args) => {
    const run = await ctx.db.get(args.runId);
    if (!run) return null;
    const world = await ctx.db.get(run.worldId);
    const agents = await ctx.db
      .query('agents')
      .withIndex('worldId', (q) => q.eq('worldId', run.worldId))
      .collect();
    const events = await ctx.db
      .query('worldEvents')
      .withIndex('worldId_tick', (q) => q.eq('worldId', run.worldId))
      .order('desc')
      .take(20);
    const traces = await ctx.db
      .query('traceEvents')
      .withIndex('worldId_tick', (q) => q.eq('worldId', run.worldId))
      .order('desc')
      .take(40);

    return { run, world, agents, events: events.reverse(), traces: traces.reverse() };
  },
});
