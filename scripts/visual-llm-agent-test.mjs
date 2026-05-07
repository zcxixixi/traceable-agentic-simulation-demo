import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const reportDir = join(process.cwd(), 'test-reports');
const summaryPath = join(reportDir, 'llm-agent.summary.md');
const rawPath = join(reportDir, 'llm-agent.raw.json');

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

function assertion(label, expected, actual, ok) {
  return { label, expected, actual, ok: Boolean(ok) };
}

const seeded = runConvex('seed:educationReformScenario', {});
const compileResult = runConvex('compiler:compileScenario', {
  scenarioId: seeded.scenarioId,
  activeInterventionId: 'replace-exams',
});
const state = runConvex('compiler:latestState', {
  scenarioId: seeded.scenarioId,
});
const result = runConvex('llmAgents:decideForScenario', {
  scenarioId: seeded.scenarioId,
  maxAgents: 1,
});
const persistedDecisions = runConvex('agents:listForScenario', {
  scenarioId: seeded.scenarioId,
});

const decision = result.decisions[0];
const assertions = [
  assertion('LLM returned at least one decision', '>= 1', result.decisionCount, result.decisionCount >= 1),
  assertion('All returned decisions were saved', result.decisionCount, result.savedCount, result.savedCount === result.decisionCount),
  assertion('Decision scenario matches current scenario', seeded.scenarioId, decision?.scenarioId, decision?.scenarioId === seeded.scenarioId),
  assertion('Decision tick matches compiled state', state.tick, decision?.tick, decision?.tick === state.tick),
  assertion('Decision has evidence grounding', 'non-empty', decision?.retrievedEvidenceIds?.length ?? 0, (decision?.retrievedEvidenceIds?.length ?? 0) > 0),
  assertion('Decision has assumption grounding', 'non-empty', decision?.retrievedAssumptionIds?.length ?? 0, (decision?.retrievedAssumptionIds?.length ?? 0) > 0),
  assertion('Decision persisted in agentDecisions', '>= 1', persistedDecisions.length, persistedDecisions.length >= 1),
];
const allPassed = assertions.every((item) => item.ok);

const raw = {
  generatedAt: new Date().toISOString(),
  result: allPassed ? 'PASS' : 'FAIL',
  seeded,
  compileResult,
  state,
  llmResult: result,
  persistedDecisions,
  assertions,
};

const metricEffects = decision
  ? Object.entries(decision.proposedAction.metricEffects)
      .map(([metric, value]) => `${metric} ${value >= 0 ? '+' : ''}${value}`)
      .join(', ')
  : 'none';

const summary = `# LLM Agent Visual Test

Result: ${allPassed ? 'PASS' : 'FAIL'}

## What Was Tested

- Seeded the education reform scenario.
- Compiled a valid SimulationState.
- Called the OpenAI-compatible LLM provider through Convex action.
- Parsed and validated one AgentDecision.
- Persisted the decision without exposing API secrets.

## Input

\`\`\`text
scenario: ${seeded.scenarioId}
state status: ${state.status}
tick: ${state.tick}
next event: ${state.eventQueue[0]?.type ?? 'none'}
target agents: ${state.eventQueue[0]?.targetAgentIds.join(', ') ?? 'none'}
\`\`\`

## LLM Decision

| Field | Value |
| --- | --- |
| Agent | ${decision?.agentId ?? 'none'} |
| Action | ${decision?.proposedAction.type ?? 'none'} |
| Evidence | ${decision?.retrievedEvidenceIds.join(', ') ?? 'none'} |
| Assumptions | ${decision?.retrievedAssumptionIds.join(', ') ?? 'none'} |
| Metric Effects | ${metricEffects} |
| Confidence | ${decision?.confidence ?? 'none'} |

## Reason

\`\`\`text
${decision?.reason ?? 'none'}
\`\`\`

## Provider Call

\`\`\`json
${JSON.stringify(result.providerCalls, null, 2)}
\`\`\`

## Assertions

| Check | Expected | Actual | Result |
| --- | --- | --- | --- |
${assertions
  .map((item) => `| ${item.label} | ${String(item.expected).replaceAll('|', '\\|')} | ${String(item.actual).replaceAll('|', '\\|')} | ${item.ok ? 'PASS' : 'FAIL'} |`)
  .join('\n')}

## Raw Data

Full raw JSON is stored separately. It does not include API keys.

\`\`\`text
${rawPath}
\`\`\`
`;

mkdirSync(reportDir, { recursive: true });
writeFileSync(summaryPath, summary);
writeFileSync(rawPath, JSON.stringify(raw, null, 2));

console.log(JSON.stringify({ ok: allPassed, summaryPath, rawPath }, null, 2));

if (!allPassed) {
  process.exit(1);
}
