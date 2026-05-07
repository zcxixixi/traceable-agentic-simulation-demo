import { v } from 'convex/values';
import { query } from './_generated/server';

export const listForScenario = query({
  args: {
    scenarioId: v.id('scenarios'),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query('evidenceCards')
      .withIndex('scenarioId', (q) => q.eq('scenarioId', args.scenarioId))
      .collect();
  },
});
