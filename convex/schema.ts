import { defineSchema, defineTable } from 'convex/server';
import { v } from 'convex/values';

const confidence = v.union(v.literal('low'), v.literal('medium'), v.literal('high'));
const runStatus = v.union(
  v.literal('idle'),
  v.literal('running'),
  v.literal('paused'),
  v.literal('failed'),
  v.literal('completed'),
);
const agentStatus = v.union(
  v.literal('idle'),
  v.literal('moving'),
  v.literal('talking'),
  v.literal('working'),
  v.literal('waiting'),
);

export default defineSchema({
  scenarios: defineTable({
    title: v.string(),
    decisionProblem: v.string(),
    status: v.union(
      v.literal('draft'),
      v.literal('world_spec_validated'),
      v.literal('compiled'),
      v.literal('running'),
      v.literal('completed'),
      v.literal('failed'),
    ),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index('status', ['status']),

  worldSpecs: defineTable({
    scenarioId: v.id('scenarios'),
    rawSpec: v.any(),
    validatedSpec: v.optional(v.any()),
    validationIssues: v.array(
      v.object({
        path: v.string(),
        message: v.string(),
      }),
    ),
    status: v.union(v.literal('valid'), v.literal('invalid')),
    createdAt: v.number(),
  }).index('scenarioId', ['scenarioId']),

  evidenceCards: defineTable({
    scenarioId: v.id('scenarios'),
    evidenceId: v.string(),
    source: v.string(),
    claim: v.string(),
    relevance: v.string(),
    embedding: v.optional(v.array(v.float64())),
    createdAt: v.number(),
  })
    .index('scenarioId', ['scenarioId'])
    .vectorIndex('byEmbedding', {
      vectorField: 'embedding',
      dimensions: 1536,
      filterFields: ['scenarioId'],
    }),

  assumptions: defineTable({
    scenarioId: v.id('scenarios'),
    assumptionId: v.string(),
    statement: v.string(),
    confidence,
    scope: v.string(),
    evidenceIds: v.array(v.string()),
    createdAt: v.number(),
  }).index('scenarioId', ['scenarioId']),

  simulationStates: defineTable({
    scenarioId: v.id('scenarios'),
    tick: v.number(),
    status: v.union(v.literal('compiled'), v.literal('running'), v.literal('completed')),
    zones: v.any(),
    agents: v.any(),
    metrics: v.any(),
    activeInterventionId: v.string(),
    eventQueue: v.any(),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index('scenarioId', ['scenarioId']),

  worlds: defineTable({
    scenarioId: v.id('scenarios'),
    sourceSimulationStateId: v.optional(v.id('simulationStates')),
    tick: v.number(),
    status: runStatus,
    zones: v.any(),
    metrics: v.any(),
    activeInterventionId: v.string(),
    globalFacts: v.array(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index('scenarioId', ['scenarioId']),

  simulationRuns: defineTable({
    scenarioId: v.id('scenarios'),
    worldId: v.id('worlds'),
    status: runStatus,
    tick: v.number(),
    maxTicks: v.number(),
    tickIntervalMs: v.number(),
    lastError: v.optional(v.string()),
    startedAt: v.number(),
    updatedAt: v.number(),
  })
    .index('scenarioId', ['scenarioId'])
    .index('worldId', ['worldId'])
    .index('status', ['status']),

  agents: defineTable({
    scenarioId: v.id('scenarios'),
    worldId: v.id('worlds'),
    agentId: v.string(),
    name: v.string(),
    role: v.string(),
    goals: v.array(v.string()),
    concerns: v.array(v.string()),
    locationZoneId: v.string(),
    currentAction: v.optional(v.string()),
    status: agentStatus,
    state: v.any(),
    lastDecisionId: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index('worldId', ['worldId'])
    .index('worldId_agentId', ['worldId', 'agentId'])
    .index('worldId_location', ['worldId', 'locationZoneId']),

  agentMemories: defineTable({
    scenarioId: v.id('scenarios'),
    worldId: v.id('worlds'),
    agentDocId: v.id('agents'),
    agentId: v.string(),
    tick: v.number(),
    type: v.union(
      v.literal('observation'),
      v.literal('decision'),
      v.literal('conversation'),
      v.literal('outcome'),
    ),
    text: v.string(),
    importance: v.number(),
    embeddingId: v.optional(v.string()),
    createdAt: v.number(),
  })
    .index('worldId', ['worldId'])
    .index('agentDocId', ['agentDocId'])
    .index('worldId_agentId', ['worldId', 'agentId']),

  worldEvents: defineTable({
    scenarioId: v.id('scenarios'),
    worldId: v.id('worlds'),
    tick: v.number(),
    actorAgentId: v.optional(v.string()),
    type: v.string(),
    payload: v.any(),
    visibleToAgentIds: v.array(v.string()),
    createdAt: v.number(),
  })
    .index('worldId_tick', ['worldId', 'tick'])
    .index('worldId_actor', ['worldId', 'actorAgentId']),

  agentDecisions: defineTable({
    scenarioId: v.id('scenarios'),
    worldId: v.optional(v.id('worlds')),
    runId: v.optional(v.id('simulationRuns')),
    decisionId: v.string(),
    tick: v.number(),
    agentId: v.string(),
    observation: v.string(),
    retrievedMemoryIds: v.optional(v.array(v.id('agentMemories'))),
    retrievedEvidenceIds: v.array(v.string()),
    retrievedAssumptionIds: v.array(v.string()),
    proposedAction: v.any(),
    reason: v.string(),
    confidence,
    rawModelOutput: v.optional(v.any()),
    createdAt: v.number(),
  })
    .index('scenarioId_tick', ['scenarioId', 'tick'])
    .index('scenarioId_agent', ['scenarioId', 'agentId'])
    .index('worldId_tick', ['worldId', 'tick']),

  traceEvents: defineTable({
    scenarioId: v.id('scenarios'),
    worldId: v.optional(v.id('worlds')),
    runId: v.optional(v.id('simulationRuns')),
    eventId: v.string(),
    tick: v.number(),
    actorId: v.string(),
    decisionId: v.optional(v.string()),
    actionType: v.string(),
    actionPayload: v.any(),
    reason: v.string(),
    evidenceIds: v.array(v.string()),
    assumptionIds: v.array(v.string()),
    memoryIds: v.optional(v.array(v.id('agentMemories'))),
    stateBefore: v.any(),
    stateAfter: v.any(),
    metricDeltas: v.any(),
    createdAt: v.number(),
  })
    .index('scenarioId_tick', ['scenarioId', 'tick'])
    .index('scenarioId_actor', ['scenarioId', 'actorId'])
    .index('worldId_tick', ['worldId', 'tick']),

  reportClaims: defineTable({
    scenarioId: v.id('scenarios'),
    claimId: v.string(),
    text: v.string(),
    confidence,
    evidenceIds: v.array(v.string()),
    assumptionIds: v.array(v.string()),
    traceEventIds: v.array(v.string()),
    createdAt: v.number(),
  }).index('scenarioId', ['scenarioId']),
});
