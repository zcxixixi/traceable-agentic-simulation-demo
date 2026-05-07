import { v } from 'convex/values';
import { mutation, query, type MutationCtx } from './_generated/server';
import { reportClaimSchema } from '../shared/harness';

async function validateClaimReferences(
  ctx: MutationCtx,
  claim: {
    scenarioId: string;
    evidenceIds: string[];
    assumptionIds: string[];
    traceEventIds: string[];
  },
) {
  const scenario = await ctx.db.get(claim.scenarioId as any);
  if (!scenario) {
    throw new Error(`Report claim references missing scenario: ${claim.scenarioId}`);
  }

  const latestSpec = await ctx.db
    .query('worldSpecs')
    .withIndex('scenarioId', (q) => q.eq('scenarioId', claim.scenarioId as any))
    .order('desc')
    .first();
  const worldSpec = latestSpec?.validatedSpec;
  if (!worldSpec) {
    throw new Error(`Report claim requires a validated world spec: ${claim.scenarioId}`);
  }

  const evidenceIds = new Set(worldSpec.evidenceCards.map((evidence: any) => evidence.id));
  for (const evidenceId of claim.evidenceIds) {
    if (!evidenceIds.has(evidenceId)) {
      throw new Error(`Report claim references unknown evidence: ${evidenceId}`);
    }
  }

  const assumptionIds = new Set(worldSpec.assumptions.map((assumption: any) => assumption.id));
  for (const assumptionId of claim.assumptionIds) {
    if (!assumptionIds.has(assumptionId)) {
      throw new Error(`Report claim references unknown assumption: ${assumptionId}`);
    }
  }

  const traceEvents = await ctx.db
    .query('traceEvents')
    .withIndex('scenarioId_tick', (q) => q.eq('scenarioId', claim.scenarioId as any))
    .collect();
  const traceEventIds = new Set(traceEvents.map((event: any) => event.eventId));
  for (const traceEventId of claim.traceEventIds) {
    if (!traceEventIds.has(traceEventId)) {
      throw new Error(`Report claim references unknown trace event: ${traceEventId}`);
    }
  }
}

export const addClaim = mutation({
  args: {
    claim: v.any(),
  },
  handler: async (ctx, args) => {
    const parsed = reportClaimSchema.safeParse(args.claim);
    if (!parsed.success) {
      throw new Error(`Invalid report claim: ${parsed.error.message}`);
    }

    const claim = parsed.data;
    await validateClaimReferences(ctx, claim);
    return await ctx.db.insert('reportClaims', {
      scenarioId: claim.scenarioId as any,
      claimId: claim.id,
      text: claim.text,
      confidence: claim.confidence,
      evidenceIds: claim.evidenceIds,
      assumptionIds: claim.assumptionIds,
      traceEventIds: claim.traceEventIds,
      createdAt: Date.now(),
    });
  },
});

export const listClaims = query({
  args: {
    scenarioId: v.id('scenarios'),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query('reportClaims')
      .withIndex('scenarioId', (q) => q.eq('scenarioId', args.scenarioId))
      .collect();
  },
});
