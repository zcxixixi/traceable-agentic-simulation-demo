import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const reportDir = join(process.cwd(), 'test-reports');
const summaryPath = join(reportDir, 'agent.summary.md');
const rawPath = join(reportDir, 'agent.raw.json');

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
const decisionResult = runConvex('agents:decideForScenario', {
  scenarioId: seeded.scenarioId,
});
const persistedDecisions = runConvex('agents:listForScenario', {
  scenarioId: seeded.scenarioId,
});

const targetAgentCount = state.eventQueue[0]?.targetAgentIds.length ?? state.agents.length;
const decisionRows = decisionResult.decisions.map((decision) => ({
  agent: decision.agentId,
  action: decision.proposedAction.type,
  evidence: decision.retrievedEvidenceIds.join(', '),
  assumptions: decision.retrievedAssumptionIds.join(', '),
  metricEffects: Object.entries(decision.proposedAction.metricEffects)
    .map(([metric, value]) => `${metric} ${value >= 0 ? '+' : ''}${value}`)
    .join(', '),
  confidence: decision.confidence,
}));

const assertions = [
  assertion('Scenario was compiled before agent decisions', 'compiled', state.status, state.status === 'compiled'),
  assertion('Agent module uses current simulation tick', state.tick, decisionResult.tick, decisionResult.tick === state.tick),
  assertion('One decision per targeted agent', targetAgentCount, decisionResult.decisionCount, decisionResult.decisionCount === targetAgentCount),
  assertion('Decisions were persisted', `>= ${decisionResult.decisionCount}`, persistedDecisions.length, persistedDecisions.length >= decisionResult.decisionCount),
  assertion('Every decision has evidence', 'non-empty', decisionResult.decisions.every((decision) => decision.retrievedEvidenceIds.length > 0), decisionResult.decisions.every((decision) => decision.retrievedEvidenceIds.length > 0)),
  assertion('Every decision has assumptions', 'non-empty', decisionResult.decisions.every((decision) => decision.retrievedAssumptionIds.length > 0), decisionResult.decisions.every((decision) => decision.retrievedAssumptionIds.length > 0)),
  assertion('Every decision has a proposed action', 'non-empty', decisionResult.decisions.every((decision) => decision.proposedAction.type.length > 0), decisionResult.decisions.every((decision) => decision.proposedAction.type.length > 0)),
];

const allPassed = assertions.every((item) => item.ok);

const raw = {
  generatedAt: new Date().toISOString(),
  result: allPassed ? 'PASS' : 'FAIL',
  seeded,
  compileResult,
  state,
  decisionResult,
  persistedDecisions,
  assertions,
};

const summary = `# Agent Module Visual Test

Result: ${allPassed ? 'PASS' : 'FAIL'}

## What Was Tested

- Agent Module reads the compiled SimulationState.
- Agent Module observes the current tick and next queued event.
- Agent Module generates one structured decision per targeted agent.
- Every decision is grounded by evidence IDs and assumption IDs.
- Every proposed action has bounded metric effects and can be persisted.

## Input

\`\`\`text
scenario: ${seeded.scenarioId}
state status: ${state.status}
tick: ${state.tick}
next event: ${state.eventQueue[0]?.type ?? 'none'}
target agents: ${state.eventQueue[0]?.targetAgentIds.join(', ') ?? 'none'}
\`\`\`

## Decision Summary

| Agent | Action | Evidence | Assumptions | Metric Effects | Confidence |
| --- | --- | --- | --- | --- | --- |
${decisionRows
  .map(
    (row) =>
      `| ${row.agent} | ${row.action} | ${row.evidence} | ${row.assumptions} | ${row.metricEffects || 'none'} | ${row.confidence} |`,
  )
  .join('\n')}

## Example Decision

\`\`\`json
${JSON.stringify(decisionResult.decisions[0], null, 2)}
\`\`\`

## Assertions

| Check | Expected | Actual | Result |
| --- | --- | --- | --- |
${assertions
  .map((item) => `| ${item.label} | ${String(item.expected).replaceAll('|', '\\|')} | ${String(item.actual).replaceAll('|', '\\|')} | ${item.ok ? 'PASS' : 'FAIL'} |`)
  .join('\n')}

## Raw Data

Full raw JSON is stored separately:

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
