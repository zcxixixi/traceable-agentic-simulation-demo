import { defineSchema, defineTable } from 'convex/server';
import { v } from 'convex/values';

const confidence = v.union(v.literal('low'), v.literal('medium'), v.literal('high'));

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

  agentDecisions: defineTable({
    scenarioId: v.id('scenarios'),
    decisionId: v.string(),
    tick: v.number(),
    agentId: v.string(),
    observation: v.string(),
    retrievedEvidenceIds: v.array(v.string()),
    retrievedAssumptionIds: v.array(v.string()),
    proposedAction: v.any(),
    reason: v.string(),
    confidence,
    createdAt: v.number(),
  })
    .index('scenarioId_tick', ['scenarioId', 'tick'])
    .index('scenarioId_agent', ['scenarioId', 'agentId']),

  traceEvents: defineTable({
    scenarioId: v.id('scenarios'),
    eventId: v.string(),
    tick: v.number(),
    actorId: v.string(),
    actionType: v.string(),
    actionPayload: v.any(),
    reason: v.string(),
    evidenceIds: v.array(v.string()),
    assumptionIds: v.array(v.string()),
    stateBefore: v.any(),
    stateAfter: v.any(),
    metricDeltas: v.any(),
    createdAt: v.number(),
  })
    .index('scenarioId_tick', ['scenarioId', 'tick'])
    .index('scenarioId_actor', ['scenarioId', 'actorId']),

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
