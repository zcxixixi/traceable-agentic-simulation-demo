import { v } from 'convex/values';
import { mutation, query } from './_generated/server';
import { validateWorldSpec } from '../shared/harness';

export const submit = mutation({
  args: {
    scenarioId: v.id('scenarios'),
    rawSpec: v.any(),
  },
  handler: async (ctx, args) => {
    const scenario = await ctx.db.get(args.scenarioId);
    if (!scenario) {
      throw new Error(`Scenario not found: ${args.scenarioId}`);
    }

    const now = Date.now();
    const validation = validateWorldSpec(args.rawSpec);
    const worldSpecId = await ctx.db.insert('worldSpecs', {
      scenarioId: args.scenarioId,
      rawSpec: args.rawSpec,
      validatedSpec: validation.ok ? validation.worldSpec : undefined,
      validationIssues: validation.issues,
      status: validation.ok ? 'valid' : 'invalid',
      createdAt: now,
    });

    await ctx.db.patch(args.scenarioId, {
      status: validation.ok ? 'world_spec_validated' : 'failed',
      updatedAt: now,
    });

    return {
      worldSpecId,
      validation,
    };
  },
});

export const latestForScenario = query({
  args: {
    scenarioId: v.id('scenarios'),
  },
  handler: async (ctx, args) => {
    const specs = await ctx.db
      .query('worldSpecs')
      .withIndex('scenarioId', (q) => q.eq('scenarioId', args.scenarioId))
      .order('desc')
      .collect();
    return specs[0] ?? null;
  },
});
