import { z } from 'zod';

export const themeSchema = z.enum([
  'pixel_campus',
  'policy_lab',
  'city_district',
  'board_game',
]);

export const confidenceSchema = z.enum(['low', 'medium', 'high']);

export const zoneSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  purpose: z.string().min(1),
  x: z.number().min(0).max(100),
  y: z.number().min(0).max(100),
});

export const stakeholderSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  role: z.string().min(1),
  goal: z.string().min(1),
  concerns: z.array(z.string().min(1)).min(1),
  startZoneId: z.string().min(1),
});

export const interventionSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  description: z.string().min(1),
  affectedStakeholderIds: z.array(z.string().min(1)).min(1),
  affectedMetricIds: z.array(z.string().min(1)).min(1),
});

export const assumptionSchema = z.object({
  id: z.string().min(1),
  statement: z.string().min(1),
  confidence: confidenceSchema,
  scope: z.string().min(1),
  evidenceIds: z.array(z.string().min(1)),
});

export const evidenceCardSchema = z.object({
  id: z.string().min(1),
  source: z.string().min(1),
  claim: z.string().min(1),
  relevance: z.string().min(1),
  embedding: z.array(z.number()).optional(),
});

export const metricSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  direction: z.enum(['increase_good', 'decrease_good', 'contextual']),
  initialValue: z.number().min(0).max(100),
});

export const worldSpecSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  theme: themeSchema,
  zones: z.array(zoneSchema).min(2).max(12),
  stakeholders: z.array(stakeholderSchema).min(4).max(10),
  interventions: z.array(interventionSchema).min(1).max(6),
  assumptions: z.array(assumptionSchema).min(1),
  evidenceCards: z.array(evidenceCardSchema).min(1),
  metrics: z.array(metricSchema).min(2).max(12),
});

export const traceEventSchema = z.object({
  id: z.string().min(1),
  tick: z.number().int().min(0),
  scenarioId: z.string().min(1),
  actorId: z.string().min(1),
  actionType: z.string().min(1),
  actionPayload: z.unknown(),
  reason: z.string().min(1),
  evidenceIds: z.array(z.string().min(1)),
  assumptionIds: z.array(z.string().min(1)),
  stateBefore: z.unknown(),
  stateAfter: z.unknown(),
  metricDeltas: z.record(z.string(), z.number()),
});

export const reportClaimSchema = z.object({
  id: z.string().min(1),
  scenarioId: z.string().min(1),
  text: z.string().min(1),
  confidence: confidenceSchema,
  evidenceIds: z.array(z.string().min(1)),
  assumptionIds: z.array(z.string().min(1)),
  traceEventIds: z.array(z.string().min(1)).min(1),
});

export const agentActionSchema = z.object({
  type: z.string().min(1),
  targetIds: z.array(z.string().min(1)).min(1),
  payload: z.unknown(),
  metricEffects: z.record(z.string(), z.number()),
});

export const agentDecisionSchema = z.object({
  id: z.string().min(1),
  scenarioId: z.string().min(1),
  tick: z.number().int().min(0),
  agentId: z.string().min(1),
  observation: z.string().min(1),
  retrievedEvidenceIds: z.array(z.string().min(1)),
  retrievedAssumptionIds: z.array(z.string().min(1)),
  proposedAction: agentActionSchema,
  reason: z.string().min(1),
  confidence: confidenceSchema,
});

export const compiledZoneSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  purpose: z.string().min(1),
  x: z.number().min(0).max(100),
  y: z.number().min(0).max(100),
});

export const compiledAgentSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  role: z.string().min(1),
  goal: z.string().min(1),
  concerns: z.array(z.string().min(1)).min(1),
  zoneId: z.string().min(1),
  x: z.number().min(0).max(100),
  y: z.number().min(0).max(100),
  state: z.object({
    satisfaction: z.number().min(0).max(100),
    trust: z.number().min(0).max(100),
    stress: z.number().min(0).max(100),
    influence: z.number().min(0).max(100),
  }),
});

export const compiledMetricSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  direction: z.enum(['increase_good', 'decrease_good', 'contextual']),
  value: z.number().min(0).max(100),
});

export const simulationEventSchema = z.object({
  id: z.string().min(1),
  tick: z.number().int().min(0),
  type: z.string().min(1),
  targetAgentIds: z.array(z.string().min(1)),
  payload: z.unknown(),
});

export const simulationStateSchema = z.object({
  scenarioId: z.string().min(1),
  tick: z.number().int().min(0),
  status: z.enum(['compiled', 'running', 'completed']),
  zones: z.array(compiledZoneSchema).min(1),
  agents: z.array(compiledAgentSchema).min(1),
  metrics: z.array(compiledMetricSchema).min(1),
  activeInterventionId: z.string().min(1),
  eventQueue: z.array(simulationEventSchema),
});

export type WorldSpec = z.infer<typeof worldSpecSchema>;
export type TraceEvent = z.infer<typeof traceEventSchema>;
export type ReportClaim = z.infer<typeof reportClaimSchema>;
export type AgentDecision = z.infer<typeof agentDecisionSchema>;
export type SimulationState = z.infer<typeof simulationStateSchema>;

export type ValidationIssue = {
  path: string;
  message: string;
};

export type HarnessValidationResult =
  | { ok: true; worldSpec: WorldSpec; issues: [] }
  | { ok: false; issues: ValidationIssue[] };

export function validateWorldSpec(input: unknown): HarnessValidationResult {
  const parsed = worldSpecSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      issues: parsed.error.issues.map((issue) => ({
        path: issue.path.join('.'),
        message: issue.message,
      })),
    };
  }

  const worldSpec = parsed.data;
  const issues = validateWorldSpecConsistency(worldSpec);
  if (issues.length > 0) {
    return { ok: false, issues };
  }
  return { ok: true, worldSpec, issues: [] };
}

export function validateWorldSpecConsistency(worldSpec: WorldSpec): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const zoneIds = new Set(worldSpec.zones.map((zone) => zone.id));
  const stakeholderIds = new Set(worldSpec.stakeholders.map((stakeholder) => stakeholder.id));
  const metricIds = new Set(worldSpec.metrics.map((metric) => metric.id));
  const evidenceIds = new Set(worldSpec.evidenceCards.map((evidence) => evidence.id));

  for (const stakeholder of worldSpec.stakeholders) {
    if (!zoneIds.has(stakeholder.startZoneId)) {
      issues.push({
        path: `stakeholders.${stakeholder.id}.startZoneId`,
        message: `Unknown zone id: ${stakeholder.startZoneId}`,
      });
    }
  }

  for (const intervention of worldSpec.interventions) {
    for (const stakeholderId of intervention.affectedStakeholderIds) {
      if (!stakeholderIds.has(stakeholderId)) {
        issues.push({
          path: `interventions.${intervention.id}.affectedStakeholderIds`,
          message: `Unknown stakeholder id: ${stakeholderId}`,
        });
      }
    }
    for (const metricId of intervention.affectedMetricIds) {
      if (!metricIds.has(metricId)) {
        issues.push({
          path: `interventions.${intervention.id}.affectedMetricIds`,
          message: `Unknown metric id: ${metricId}`,
        });
      }
    }
  }

  for (const assumption of worldSpec.assumptions) {
    for (const evidenceId of assumption.evidenceIds) {
      if (!evidenceIds.has(evidenceId)) {
        issues.push({
          path: `assumptions.${assumption.id}.evidenceIds`,
          message: `Unknown evidence id: ${evidenceId}`,
        });
      }
    }
  }

  return issues;
}
