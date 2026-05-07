import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const reportDir = join(process.cwd(), 'test-reports');
const summaryPath = join(reportDir, 'evidence-assumption.summary.md');
const rawPath = join(reportDir, 'evidence-assumption.raw.json');

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
const evidence = runConvex('evidence:listForScenario', {
  scenarioId: seeded.scenarioId,
});
const assumptions = runConvex('assumptions:listForScenario', {
  scenarioId: seeded.scenarioId,
});

const evidenceIds = new Set(evidence.map((item) => item.evidenceId));
const assumptionsWithMissingEvidence = assumptions.filter((assumption) =>
  assumption.evidenceIds.some((evidenceId) => !evidenceIds.has(evidenceId)),
);

const assertions = [
  assertion('Seed returns scenarioId', 'non-empty string', seeded.scenarioId, typeof seeded.scenarioId === 'string' && seeded.scenarioId.length > 0),
  assertion('Evidence cards persisted', 3, evidence.length, evidence.length === 3),
  assertion('Assumptions persisted', 3, assumptions.length, assumptions.length === 3),
  assertion('Every evidence card has source', true, evidence.every((item) => Boolean(item.source)), evidence.every((item) => Boolean(item.source))),
  assertion('Every evidence card has claim', true, evidence.every((item) => Boolean(item.claim)), evidence.every((item) => Boolean(item.claim))),
  assertion('Every assumption links to evidence', true, assumptions.every((item) => item.evidenceIds.length > 0), assumptions.every((item) => item.evidenceIds.length > 0)),
  assertion('Every assumption evidence link resolves', 0, assumptionsWithMissingEvidence.length, assumptionsWithMissingEvidence.length === 0),
];

const allPassed = assertions.every((item) => item.ok);

const evidenceSummary = evidence.map((item) => ({
  id: item.evidenceId,
  source: item.source,
  claim: item.claim,
}));

const assumptionSummary = assumptions.map((item) => ({
  id: item.assumptionId,
  confidence: item.confidence,
  evidenceIds: item.evidenceIds,
  statement: item.statement,
}));

const raw = {
  generatedAt: new Date().toISOString(),
  result: allPassed ? 'PASS' : 'FAIL',
  seeded,
  evidence,
  assumptions,
  assertions,
  assumptionsWithMissingEvidence,
};

const summary = `# Evidence / Assumption Visual Test

Result: ${allPassed ? 'PASS' : 'FAIL'}

## What Was Tested

- Seed creates evidence cards.
- Seed creates assumptions.
- Each evidence card has a source and claim.
- Each assumption links to evidence.
- Each assumption evidence link resolves to a real evidence card.

## Input

\`\`\`text
seed:educationReformScenario
\`\`\`

## Output Summary

Scenario ID:

\`\`\`text
${seeded.scenarioId}
\`\`\`

Evidence cards: ${evidence.length}

${evidenceSummary.map((item) => `- ${item.id}: ${item.claim}`).join('\n')}

Assumptions: ${assumptions.length}

${assumptionSummary.map((item) => `- ${item.id} (${item.confidence}): ${item.statement} [evidence: ${item.evidenceIds.join(', ')}]`).join('\n')}

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
