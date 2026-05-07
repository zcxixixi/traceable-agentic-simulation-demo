import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const reportDir = join(process.cwd(), 'test-reports');
const reportPath = join(reportDir, 'scenario.md');

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

function pass(label, condition, detail) {
  return {
    label,
    condition,
    detail,
    ok: Boolean(condition),
  };
}

const input = {
  title: 'Visual Scenario Test',
  decisionProblem:
    'If high schools replace traditional exams with AI-assisted project-based assessment, what happens?',
};

const createdScenarioId = runConvex('scenarios:create', input);
const scenario = runConvex('scenarios:get', { scenarioId: createdScenarioId });

const assertions = [
  pass('Scenario ID is returned', typeof createdScenarioId === 'string' && createdScenarioId.length > 0, createdScenarioId),
  pass('Scenario can be fetched by ID', scenario !== null, scenario?._id),
  pass('Fetched scenario ID matches created ID', scenario?._id === createdScenarioId, scenario?._id),
  pass('Title is preserved', scenario?.title === input.title, scenario?.title),
  pass('Decision problem is preserved', scenario?.decisionProblem === input.decisionProblem, scenario?.decisionProblem),
  pass('Initial status is draft', scenario?.status === 'draft', scenario?.status),
  pass('createdAt is a number', typeof scenario?.createdAt === 'number', String(scenario?.createdAt)),
  pass('updatedAt is a number', typeof scenario?.updatedAt === 'number', String(scenario?.updatedAt)),
];

const allPassed = assertions.every((assertion) => assertion.ok);

const markdown = `# Visual Test Report: Scenario Module

Generated at: ${new Date().toISOString()}

## What This Test Proves

This test verifies that the Scenario module can create a decision-simulation container, fetch it back from Convex, and preserve the required input fields.

## Flow

\`\`\`text
Input
  -> scenarios:create
  -> Convex scenarios table
  -> scenarios:get
  -> Assertions
  -> Result
\`\`\`

## Input

\`\`\`json
${JSON.stringify(input, null, 2)}
\`\`\`

## Action 1: scenarios:create

Returned scenario ID:

\`\`\`text
${createdScenarioId}
\`\`\`

## Action 2: scenarios:get

Fetched database record:

\`\`\`json
${JSON.stringify(scenario, null, 2)}
\`\`\`

## Assertions

| Check | Expected | Actual | Result |
| --- | --- | --- | --- |
${assertions
  .map((assertion) => `| ${assertion.label} | true | ${String(assertion.detail).replaceAll('|', '\\|')} | ${assertion.ok ? 'PASS' : 'FAIL'} |`)
  .join('\n')}

## Final Result

${allPassed ? 'PASS' : 'FAIL'}

## Interpretation

If this report says PASS, the Scenario module is doing its basic job:

- accepting a natural-language decision problem;
- creating a persistent scenario record;
- returning an ID that can be used by other modules;
- starting the scenario in \`draft\` status.
`;

mkdirSync(reportDir, { recursive: true });
writeFileSync(reportPath, markdown);

console.log(JSON.stringify({ ok: allPassed, reportPath }, null, 2));

if (!allPassed) {
  process.exit(1);
}
