import { execFileSync } from 'node:child_process';

function runConvex(functionName, args) {
  const output = execFileSync(
    'npx',
    ['convex', 'run', functionName, JSON.stringify(args ?? {})],
    {
      cwd: process.cwd(),
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  );
  return JSON.parse(output);
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

const maxAgents = Number(process.argv[2] ?? 3);

const result = runConvex('pipeline:runEducationReformDemo', {
  question:
    'If high schools replace exams with AI-assisted project-based assessment, what happens?',
  maxAgents,
});

assert(result.pipelineSteps.length === 12, 'Expected all 12 pipeline steps');
assert(result.compiledState.agents.length === 6, 'Expected six visual agents');
assert(result.agentDecisions.length === maxAgents, `Expected ${maxAgents} LLM agent decisions`);
assert(result.traceEvents.length >= maxAgents, 'Expected persisted trace events');
assert(result.reportClaims.length >= 1, 'Expected auditable report claims');
assert(result.retrievalResults.length >= 1, 'Expected retrieval results');

console.log(
  JSON.stringify(
    {
      ok: true,
      scenarioId: result.scenarioId,
      steps: result.pipelineSteps.length,
      agents: result.compiledState.agents.length,
      decisions: result.agentDecisions.length,
      traces: result.traceEvents.length,
      claims: result.reportClaims.length,
      retrievalResults: result.retrievalResults.length,
      providerCalls: result.providerCalls,
    },
    null,
    2,
  ),
);
