import { v } from 'convex/values';
import { mutation, query, type MutationCtx } from './_generated/server';
import { traceEventSchema } from '../shared/harness';

async function validateTraceReferences(
  ctx: MutationCtx,
  traceEvent: {
    scenarioId: string;
    actorId: string;
    evidenceIds: string[];
    assumptionIds: string[];
    metricDeltas: Record<string, number>;
  },
) {
  const scenario = await ctx.db.get(traceEvent.scenarioId as any);
  if (!scenario) {
    throw new Error(`Trace references missing scenario: ${traceEvent.scenarioId}`);
  }

  const latestSpec = await ctx.db
    .query('worldSpecs')
    .withIndex('scenarioId', (q) => q.eq('scenarioId', traceEvent.scenarioId as any))
    .order('desc')
    .first();
  const worldSpec = latestSpec?.validatedSpec;
  if (!worldSpec) {
    throw new Error(`Trace requires a validated world spec for scenario: ${traceEvent.scenarioId}`);
  }

  const stakeholderIds = new Set(worldSpec.stakeholders.map((stakeholder: any) => stakeholder.id));
  if (!stakeholderIds.has(traceEvent.actorId)) {
    throw new Error(`Trace references unknown actor: ${traceEvent.actorId}`);
  }

  const evidenceIds = new Set(worldSpec.evidenceCards.map((evidence: any) => evidence.id));
  for (const evidenceId of traceEvent.evidenceIds) {
    if (!evidenceIds.has(evidenceId)) {
      throw new Error(`Trace references unknown evidence: ${evidenceId}`);
    }
  }

  const assumptionIds = new Set(worldSpec.assumptions.map((assumption: any) => assumption.id));
  for (const assumptionId of traceEvent.assumptionIds) {
    if (!assumptionIds.has(assumptionId)) {
      throw new Error(`Trace references unknown assumption: ${assumptionId}`);
    }
  }

  const metricIds = new Set(worldSpec.metrics.map((metric: any) => metric.id));
  for (const metricId of Object.keys(traceEvent.metricDeltas)) {
    if (!metricIds.has(metricId)) {
      throw new Error(`Trace references unknown metric: ${metricId}`);
    }
  }
}

export const append = mutation({
  args: {
    traceEvent: v.any(),
  },
  handler: async (ctx, args) => {
    const parsed = traceEventSchema.safeParse(args.traceEvent);
    if (!parsed.success) {
      throw new Error(`Invalid trace event: ${parsed.error.message}`);
    }

    const traceEvent = parsed.data;
    await validateTraceReferences(ctx, traceEvent);
    return await ctx.db.insert('traceEvents', {
      scenarioId: traceEvent.scenarioId as any,
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
  },
});

export const listForScenario = query({
  args: {
    scenarioId: v.id('scenarios'),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query('traceEvents')
      .withIndex('scenarioId_tick', (q) => q.eq('scenarioId', args.scenarioId))
      .order('asc')
      .collect();
  },
});
