import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const reportDir = join(process.cwd(), 'test-reports');
const summaryPath = join(reportDir, 'compiler.summary.md');
const rawPath = join(reportDir, 'compiler.raw.json');

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

const activeInterventionId = 'replace-exams';
const seeded = runConvex('seed:educationReformScenario', {});
const latestSpec = runConvex('worldSpecs:latestForScenario', {
  scenarioId: seeded.scenarioId,
});
const compileResult = runConvex('compiler:compileScenario', {
  scenarioId: seeded.scenarioId,
  activeInterventionId,
});
const scenarioAfterCompile = runConvex('scenarios:get', {
  scenarioId: seeded.scenarioId,
});
const simulationState = runConvex('compiler:latestState', {
  scenarioId: seeded.scenarioId,
});

const worldSpec = latestSpec.validatedSpec;
const agentsWithMissingZone = simulationState.agents.filter((agent) => !agent.zoneId);
const agentsWithInvalidCoordinates = simulationState.agents.filter(
  (agent) =>
    typeof agent.x !== 'number' ||
    typeof agent.y !== 'number' ||
    agent.x < 0 ||
    agent.x > 100 ||
    agent.y < 0 ||
    agent.y > 100,
);

const assertions = [
  assertion('Scenario starts from validated WorldSpec', 'valid', latestSpec.status, latestSpec.status === 'valid'),
  assertion('Compile returns status compiled', 'compiled', compileResult.status, compileResult.status === 'compiled'),
  assertion('Scenario status becomes compiled', 'compiled', scenarioAfterCompile.status, scenarioAfterCompile.status === 'compiled'),
  assertion('Initial tick is 0', 0, simulationState.tick, simulationState.tick === 0),
  assertion('Agent count equals stakeholder count', worldSpec.stakeholders.length, simulationState.agents.length, simulationState.agents.length === worldSpec.stakeholders.length),
  assertion('Metric count equals WorldSpec metric count', worldSpec.metrics.length, simulationState.metrics.length, simulationState.metrics.length === worldSpec.metrics.length),
  assertion('Zone count equals WorldSpec zone count', worldSpec.zones.length, simulationState.zones.length, simulationState.zones.length === worldSpec.zones.length),
  assertion('Active intervention is preserved', activeInterventionId, simulationState.activeInterventionId, simulationState.activeInterventionId === activeInterventionId),
  assertion('Every agent has a zone', 0, agentsWithMissingZone.length, agentsWithMissingZone.length === 0),
  assertion('Every agent has valid x/y coordinates', 0, agentsWithInvalidCoordinates.length, agentsWithInvalidCoordinates.length === 0),
  assertion('Initial event queue is created', '>= 1', simulationState.eventQueue.length, simulationState.eventQueue.length >= 1),
];

const allPassed = assertions.every((item) => item.ok);

const agentSummary = simulationState.agents.map((agent) => ({
  id: agent.id,
  zoneId: agent.zoneId,
  x: agent.x,
  y: agent.y,
}));

const metricSummary = simulationState.metrics.map((metric) => ({
  id: metric.id,
  value: metric.value,
  direction: metric.direction,
}));

const raw = {
  generatedAt: new Date().toISOString(),
  result: allPassed ? 'PASS' : 'FAIL',
  seeded,
  latestSpec,
  compileResult,
  scenarioAfterCompile,
  simulationState,
  assertions,
};

const summary = `# Compiler Visual Test

Result: ${allPassed ? 'PASS' : 'FAIL'}

## What Was Tested

- A validated WorldSpec can be compiled into SimulationState.
- Scenario status changes from \`world_spec_validated\` to \`compiled\`.
- Stakeholders become executable agents with positions.
- Metrics copy their initial values into runtime state.
- The selected intervention becomes active.
- An initial event queue is created.

## Input

Scenario:

\`\`\`text
${seeded.scenarioId}
\`\`\`

Active intervention:

\`\`\`text
${activeInterventionId}
\`\`\`

WorldSpec summary:

\`\`\`text
zones: ${worldSpec.zones.length}
stakeholders: ${worldSpec.stakeholders.length}
metrics: ${worldSpec.metrics.length}
interventions: ${worldSpec.interventions.map((item) => item.id).join(', ')}
\`\`\`

## Output Summary

Compile result:

\`\`\`json
${JSON.stringify(compileResult, null, 2)}
\`\`\`

Agents placed:

${agentSummary.map((agent) => `- ${agent.id}: zone=${agent.zoneId}, x=${agent.x}, y=${agent.y}`).join('\n')}

Metrics initialized:

${metricSummary.map((metric) => `- ${metric.id}: value=${metric.value}, direction=${metric.direction}`).join('\n')}

Event queue:

\`\`\`text
${simulationState.eventQueue.length} event(s), first type: ${simulationState.eventQueue[0]?.type ?? 'none'}
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
