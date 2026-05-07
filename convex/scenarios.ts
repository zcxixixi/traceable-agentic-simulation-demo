import { v } from 'convex/values';
import { mutation, query } from './_generated/server';

export const create = mutation({
  args: {
    title: v.string(),
    decisionProblem: v.string(),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    return await ctx.db.insert('scenarios', {
      title: args.title,
      decisionProblem: args.decisionProblem,
      status: 'draft',
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const list = query({
  handler: async (ctx) => {
    return await ctx.db.query('scenarios').order('desc').collect();
  },
});

export const get = query({
  args: {
    scenarioId: v.id('scenarios'),
  },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.scenarioId);
  },
});
