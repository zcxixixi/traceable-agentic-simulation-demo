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

const seeded = runConvex('seed:educationReformScenario', {});
runConvex('compiler:compileScenario', {
  scenarioId: seeded.scenarioId,
  activeInterventionId: 'replace-exams',
});

const result = runConvex('llmAgents:decideForScenario', {
  scenarioId: seeded.scenarioId,
  maxAgents: 1,
});

assert(result.decisionCount >= 1, 'Expected at least one LLM agent decision');
assert(result.savedCount === result.decisionCount, 'Expected all LLM decisions to be saved');
assert(result.decisions[0]?.retrievedEvidenceIds?.length > 0, 'Expected evidence grounding');
assert(result.decisions[0]?.retrievedAssumptionIds?.length > 0, 'Expected assumption grounding');
assert(result.decisions[0]?.proposedAction?.type, 'Expected a proposed action type');

console.log(
  JSON.stringify(
    {
      ok: true,
      scenarioId: seeded.scenarioId,
      decisionCount: result.decisionCount,
      savedCount: result.savedCount,
      firstDecision: {
        agentId: result.decisions[0].agentId,
        actionType: result.decisions[0].proposedAction.type,
        evidenceIds: result.decisions[0].retrievedEvidenceIds,
        assumptionIds: result.decisions[0].retrievedAssumptionIds,
        metricEffects: result.decisions[0].proposedAction.metricEffects,
      },
      providerCalls: result.providerCalls,
    },
    null,
    2,
  ),
);
