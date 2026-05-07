import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const reportDir = join(process.cwd(), 'test-reports');
const reportPath = join(reportDir, 'worldspec-harness.md');

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

const validSpec = {
  id: 'visual-worldspec-valid',
  title: 'Visual Harness WorldSpec',
  theme: 'pixel_campus',
  zones: [
    {
      id: 'classroom',
      name: 'Classroom',
      purpose: 'Students experience assessment changes.',
      x: 20,
      y: 35,
    },
    {
      id: 'teacher-office',
      name: 'Teacher Office',
      purpose: 'Teachers discuss workload and grading.',
      x: 60,
      y: 40,
    },
  ],
  stakeholders: [
    {
      id: 'student',
      name: 'Student',
      role: 'High school student',
      goal: 'Receive fair evaluation.',
      concerns: ['fairness'],
      startZoneId: 'classroom',
    },
    {
      id: 'parent',
      name: 'Parent',
      role: 'Family decision-maker',
      goal: 'Protect the student from unfair evaluation.',
      concerns: ['cost', 'authenticity'],
      startZoneId: 'classroom',
    },
    {
      id: 'teacher',
      name: 'Teacher',
      role: 'Assessment designer',
      goal: 'Grade fairly without overload.',
      concerns: ['workload'],
      startZoneId: 'teacher-office',
    },
    {
      id: 'principal',
      name: 'Principal',
      role: 'School administrator',
      goal: 'Implement reform responsibly.',
      concerns: ['trust'],
      startZoneId: 'teacher-office',
    },
  ],
  interventions: [
    {
      id: 'hybrid-assessment',
      name: 'Hybrid assessment',
      description: 'Combine project assessment with reduced traditional exams.',
      affectedStakeholderIds: ['student', 'parent', 'teacher', 'principal'],
      affectedMetricIds: ['fairness', 'workload'],
    },
  ],
  assumptions: [
    {
      id: 'A1',
      statement: 'Teacher workload rises when project rubrics are immature.',
      confidence: 'medium',
      scope: 'school operations',
      evidenceIds: ['EV1'],
    },
  ],
  evidenceCards: [
    {
      id: 'EV1',
      source: 'Teacher workload placeholder',
      claim: 'Open-ended assessment can increase grading and feedback demands.',
      relevance: 'Constrains workload effects.',
    },
  ],
  metrics: [
    {
      id: 'fairness',
      name: 'Fairness',
      direction: 'increase_good',
      initialValue: 50,
    },
    {
      id: 'workload',
      name: 'Teacher workload',
      direction: 'decrease_good',
      initialValue: 45,
    },
  ],
};

const scenarioInput = {
  title: 'Visual WorldSpec Harness Test',
  decisionProblem:
    'If high schools replace traditional exams with AI-assisted project-based assessment, what happens?',
};

const validScenarioId = runConvex('scenarios:create', scenarioInput);
const validSubmit = runConvex('worldSpecs:submit', {
  scenarioId: validScenarioId,
  rawSpec: validSpec,
});
const latestValid = runConvex('worldSpecs:latestForScenario', {
  scenarioId: validScenarioId,
});

const invalidScenarioId = runConvex('scenarios:create', {
  title: 'Visual Invalid WorldSpec Harness Test',
  decisionProblem: 'This scenario intentionally submits an invalid world spec.',
});
const invalidSpec = {
  ...validSpec,
  id: 'visual-worldspec-invalid',
  stakeholders: [
    {
      ...validSpec.stakeholders[0],
      startZoneId: 'missing-zone',
    },
    ...validSpec.stakeholders.slice(1),
  ],
};
const invalidSubmit = runConvex('worldSpecs:submit', {
  scenarioId: invalidScenarioId,
  rawSpec: invalidSpec,
});
const latestInvalid = runConvex('worldSpecs:latestForScenario', {
  scenarioId: invalidScenarioId,
});

const assertions = [
  assertion(
    'Valid WorldSpec returns validation.ok = true',
    true,
    validSubmit.validation.ok,
    validSubmit.validation.ok === true,
  ),
  assertion(
    'Valid WorldSpec is stored with status valid',
    'valid',
    latestValid.status,
    latestValid.status === 'valid',
  ),
  assertion(
    'Validated spec preserves theme',
    validSpec.theme,
    latestValid.validatedSpec?.theme,
    latestValid.validatedSpec?.theme === validSpec.theme,
  ),
  assertion(
    'Validated spec preserves stakeholder count',
    validSpec.stakeholders.length,
    latestValid.validatedSpec?.stakeholders?.length,
    latestValid.validatedSpec?.stakeholders?.length === validSpec.stakeholders.length,
  ),
  assertion(
    'Invalid WorldSpec returns validation.ok = false',
    false,
    invalidSubmit.validation.ok,
    invalidSubmit.validation.ok === false,
  ),
  assertion(
    'Invalid WorldSpec is stored with status invalid',
    'invalid',
    latestInvalid.status,
    latestInvalid.status === 'invalid',
  ),
  assertion(
    'Invalid WorldSpec reports missing zone',
    'Unknown zone id',
    invalidSubmit.validation.issues.map((issue) => issue.message).join('; '),
    invalidSubmit.validation.issues.some((issue) => issue.message.includes('Unknown zone id')),
  ),
];

const allPassed = assertions.every((item) => item.ok);

const markdown = `# Visual Test Report: WorldSpec / Harness Module

Generated at: ${new Date().toISOString()}

## What This Test Proves

This test verifies that the harness accepts a valid AI-generated world specification and rejects an invalid one with a concrete validation issue.

## Flow

\`\`\`text
Valid path:
Scenario
  -> raw WorldSpec
  -> worldSpecs:submit
  -> schema validation
  -> consistency validation
  -> stored as valid

Invalid path:
Scenario
  -> raw WorldSpec with missing startZoneId
  -> worldSpecs:submit
  -> consistency validation
  -> stored as invalid
  -> validation issue returned
\`\`\`

## Valid Input: WorldSpec Summary

\`\`\`json
${JSON.stringify(
  {
    id: validSpec.id,
    title: validSpec.title,
    theme: validSpec.theme,
    zones: validSpec.zones.map((zone) => zone.id),
    stakeholders: validSpec.stakeholders.map((stakeholder) => ({
      id: stakeholder.id,
      startZoneId: stakeholder.startZoneId,
    })),
    interventions: validSpec.interventions.map((intervention) => intervention.id),
    assumptions: validSpec.assumptions.map((assumption) => assumption.id),
    evidenceCards: validSpec.evidenceCards.map((evidence) => evidence.id),
    metrics: validSpec.metrics.map((metric) => metric.id),
  },
  null,
  2,
)}
\`\`\`

## Valid Output: worldSpecs:submit

\`\`\`json
${JSON.stringify(validSubmit, null, 2)}
\`\`\`

## Valid Database Record

\`\`\`json
${JSON.stringify(latestValid, null, 2)}
\`\`\`

## Invalid Input Mutation

Changed:

\`\`\`json
{
  "stakeholders[0].id": "${invalidSpec.stakeholders[0].id}",
  "stakeholders[0].startZoneId": "${invalidSpec.stakeholders[0].startZoneId}"
}
\`\`\`

## Invalid Output: worldSpecs:submit

\`\`\`json
${JSON.stringify(invalidSubmit, null, 2)}
\`\`\`

## Invalid Database Record

\`\`\`json
${JSON.stringify(latestInvalid, null, 2)}
\`\`\`

## Assertions

| Check | Expected | Actual | Result |
| --- | --- | --- | --- |
${assertions
  .map((item) => `| ${item.label} | ${String(item.expected).replaceAll('|', '\\|')} | ${String(item.actual).replaceAll('|', '\\|')} | ${item.ok ? 'PASS' : 'FAIL'} |`)
  .join('\n')}

## Final Result

${allPassed ? 'PASS' : 'FAIL'}

## Interpretation

If this report says PASS, the harness is doing its first critical job:

- accepting a structured world spec that is runnable;
- rejecting a world spec that references a missing zone;
- returning a concrete validation issue that can be shown to an AI repair step or human reviewer.
`;

mkdirSync(reportDir, { recursive: true });
writeFileSync(reportPath, markdown);

console.log(JSON.stringify({ ok: allPassed, reportPath }, null, 2));

if (!allPassed) {
  process.exit(1);
}
