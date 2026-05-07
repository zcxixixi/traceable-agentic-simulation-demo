import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const reportDir = join(process.cwd(), 'test-reports');
const summaryPath = join(reportDir, 'runtime.summary.md');
const rawPath = join(reportDir, 'runtime.raw.json');

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
const beforeState = runConvex('compiler:latestState', {
  scenarioId: seeded.scenarioId,
});
const runResult = runConvex('runtime:runStep', {
  scenarioId: seeded.scenarioId,
});
const afterState = runConvex('compiler:latestState', {
  scenarioId: seeded.scenarioId,
});
const traces = runConvex('traces:listForScenario', {
  scenarioId: seeded.scenarioId,
});

const beforeMetrics = Object.fromEntries(beforeState.metrics.map((metric) => [metric.id, metric.value]));
const afterMetrics = Object.fromEntries(afterState.metrics.map((metric) => [metric.id, metric.value]));

const changedMetrics = afterState.metrics
  .map((metric) => ({
    id: metric.id,
    before: beforeMetrics[metric.id],
    after: metric.value,
    delta: metric.value - beforeMetrics[metric.id],
  }))
  .filter((metric) => metric.delta !== 0);

const agentStateChanges = afterState.agents.map((agent) => {
  const before = beforeState.agents.find((item) => item.id === agent.id);
  return {
    id: agent.id,
    trustBefore: before?.state.trust,
    trustAfter: agent.state.trust,
    stressBefore: before?.state.stress,
    stressAfter: agent.state.stress,
  };
});

const assertions = [
  assertion('Compiled state exists before runtime', 'compiled', beforeState.status, beforeState.status === 'compiled'),
  assertion('Runtime advances tick from 0 to 1', 1, afterState.tick, beforeState.tick === 0 && afterState.tick === 1),
  assertion('Runtime processes one queued event', 1, runResult.processedEventCount, runResult.processedEventCount === 1),
  assertion('Runtime creates one trace per target agent', beforeState.eventQueue[0].targetAgentIds.length, runResult.traceEventCount, runResult.traceEventCount === beforeState.eventQueue[0].targetAgentIds.length),
  assertion('Event queue is empty after first event', 0, afterState.eventQueue.length, afterState.eventQueue.length === 0),
  assertion('Scenario reaches completed when no events remain', 'completed', afterState.status, afterState.status === 'completed'),
  assertion('At least one metric changed', '>= 1', changedMetrics.length, changedMetrics.length >= 1),
  assertion('Trace events persisted', runResult.traceEventCount, traces.length, traces.length >= runResult.traceEventCount),
];

const allPassed = assertions.every((item) => item.ok);

const raw = {
  generatedAt: new Date().toISOString(),
  result: allPassed ? 'PASS' : 'FAIL',
  seeded,
  compileResult,
  beforeState,
  runResult,
  afterState,
  traces,
  assertions,
};

const summary = `# Simulation Runtime Visual Test

Result: ${allPassed ? 'PASS' : 'FAIL'}

## What Was Tested

- Runtime starts from a compiled SimulationState.
- Runtime advances the simulation by one tick.
- Runtime processes due events from the event queue.
- Runtime updates agent state and metrics.
- Runtime writes machine-readable trace events.

## Input

Scenario:

\`\`\`text
${seeded.scenarioId}
\`\`\`

Compiled state:

\`\`\`text
status: ${beforeState.status}
tick: ${beforeState.tick}
queued events: ${beforeState.eventQueue.length}
first event: ${beforeState.eventQueue[0]?.type ?? 'none'}
target agents: ${beforeState.eventQueue[0]?.targetAgentIds.join(', ') ?? 'none'}
\`\`\`

## Runtime Output

\`\`\`json
${JSON.stringify(runResult, null, 2)}
\`\`\`

## State Change Summary

Tick:

\`\`\`text
${beforeState.tick} -> ${afterState.tick}
\`\`\`

Status:

\`\`\`text
${beforeState.status} -> ${afterState.status}
\`\`\`

Changed metrics:

${changedMetrics.map((metric) => `- ${metric.id}: ${metric.before} -> ${metric.after} (${metric.delta >= 0 ? '+' : ''}${metric.delta})`).join('\n')}

Agent state changes:

${agentStateChanges.map((agent) => `- ${agent.id}: trust ${agent.trustBefore} -> ${agent.trustAfter}, stress ${agent.stressBefore} -> ${agent.stressAfter}`).join('\n')}

Trace events created:

\`\`\`text
${runResult.traceEventCount}
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
