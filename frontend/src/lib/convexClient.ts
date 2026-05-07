import { ConvexHttpClient } from 'convex/browser';
import { api } from '../../../convex/_generated/api';
import type { PipelineRunResult } from './demoSchema';

const convexUrl = import.meta.env.VITE_CONVEX_URL || 'http://127.0.0.1:3210';
const client = new ConvexHttpClient(convexUrl);

export async function runEducationReformPipeline(
  question: string,
  maxAgents: number,
): Promise<PipelineRunResult> {
  const result = await client.action(api.pipeline.runEducationReformDemo, {
    question,
    maxAgents,
  });
  return result as unknown as PipelineRunResult;
}
