import { v } from 'convex/values';
import { action } from './_generated/server';
import { api } from './_generated/api';

type Confidence = 'low' | 'medium' | 'high';

type AgentDecision = {
  id: string;
  scenarioId: string;
  tick: number;
  agentId: string;
  observation: string;
  retrievedEvidenceIds: string[];
  retrievedAssumptionIds: string[];
  proposedAction: {
    type: string;
    targetIds: string[];
    payload: unknown;
    metricEffects: Record<string, number>;
  };
  reason: string;
  confidence: Confidence;
};

type PipelineRunResult = Record<string, unknown>;

const zoneLayout: Record<
  string,
  { x: number; y: number; width: number; height: number; color: number }
> = {
  classroom: { x: 120, y: 120, width: 190, height: 130, color: 0x8fbf6f },
  'teacher-office': { x: 390, y: 95, width: 190, height: 125, color: 0xb98a5c },
  'principal-office': { x: 645, y: 145, width: 210, height: 130, color: 0x8a8ec7 },
  'admissions-office': { x: 635, y: 390, width: 230, height: 140, color: 0x739ec8 },
  'tutoring-street': { x: 185, y: 395, width: 230, height: 145, color: 0xc49a54 },
};

const agentOffsets: Record<string, { dx: number; dy: number; row: number }> = {
  student: { dx: 65, dy: 65, row: 0 },
  parent: { dx: 125, dy: 75, row: 1 },
  teacher: { dx: 80, dy: 65, row: 2 },
  principal: { dx: 90, dy: 65, row: 3 },
  'admissions-officer': { dx: 110, dy: 65, row: 4 },
  'tutoring-owner': { dx: 110, dy: 75, row: 5 },
};

function pipelineSteps() {
  return [
    'User Input',
    'Scenario Module',
    'WorldSpec + Harness',
    'Evidence Module',
    'Assumption Module',
    'Compiler Module',
    'Simulation Runtime',
    'Agent Module',
    'Trace Module',
    'Report Module',
    'Frontend Visualization',
    'Vector Search',
  ].map((name, index) => ({ id: index + 1, name, status: 'done' as const }));
}

function clampMetric(value: number) {
  return Math.max(0, Math.min(100, value));
}

function confidenceFromCount(count: number): Confidence {
  if (count >= 3) return 'high';
  if (count === 2) return 'medium';
  return 'low';
}

function makeTraceEvent(args: {
  scenarioId: string;
  tick: number;
  decision: AgentDecision;
  stateBefore: unknown;
}) {
  const metricDeltas = args.decision.proposedAction.metricEffects;
  return {
    id: `TE-${args.decision.id}`,
    tick: args.tick,
    scenarioId: args.scenarioId,
    actorId: args.decision.agentId,
    actionType: args.decision.proposedAction.type,
    actionPayload: args.decision.proposedAction,
    reason: args.decision.reason,
    evidenceIds: args.decision.retrievedEvidenceIds,
    assumptionIds: args.decision.retrievedAssumptionIds,
    stateBefore: args.stateBefore,
    stateAfter: {
      decisionId: args.decision.id,
      metricEffects: metricDeltas,
    },
    metricDeltas,
  };
}

function buildRetrievalResults(evidence: any[], assumptions: any[], traces: any[]) {
  const evidenceResults = evidence.slice(0, 2).map((item, index) => ({
    id: item.evidenceId,
    kind: 'evidence' as const,
    title: item.source,
    text: item.claim,
    score: 0.92 - index * 0.04,
  }));
  const assumptionResults = assumptions.slice(0, 1).map((item) => ({
    id: item.assumptionId,
    kind: 'assumption' as const,
    title: item.scope,
    text: item.statement,
    score: 0.81,
  }));
  const traceResults = traces.slice(0, 1).map((item) => ({
    id: item.eventId,
    kind: 'trace' as const,
    title: item.actionType,
    text: item.reason,
    score: 0.76,
  }));
  return [...evidenceResults, ...assumptionResults, ...traceResults];
}

export const runEducationReformDemo = action({
  args: {
    question: v.optional(v.string()),
    maxAgents: v.optional(v.number()),
  },
  handler: async (ctx, args): Promise<PipelineRunResult> => {
    const question =
      args.question ??
      'If high schools replace exams with AI-assisted project-based assessment, what happens?';
    const maxAgents = Math.max(1, Math.min(6, Math.floor(args.maxAgents ?? 6)));

    const seeded: { scenarioId: any } = await ctx.runMutation(api.seed.educationReformScenario);
    await ctx.runMutation(api.compiler.compileScenario, {
      scenarioId: seeded.scenarioId,
      activeInterventionId: 'replace-exams',
    });
    const compiledState: any = await ctx.runQuery(api.compiler.latestState, {
      scenarioId: seeded.scenarioId,
    });
    if (!compiledState) {
      throw new Error('Pipeline failed: compiler did not create a SimulationState');
    }

    const llmResult: {
      decisions: AgentDecision[];
      providerCalls: unknown;
    } = await ctx.runAction(api.llmAgents.decideForScenario, {
      scenarioId: seeded.scenarioId,
      maxAgents,
    });
    const decisions = llmResult.decisions as AgentDecision[];

    for (const decision of decisions) {
      const traceEvent = makeTraceEvent({
        scenarioId: seeded.scenarioId,
        tick: compiledState.tick + 1,
        decision,
        stateBefore: {
          tick: compiledState.tick,
          actorId: decision.agentId,
          metrics: compiledState.metrics,
        },
      });
      await ctx.runMutation(api.traces.append, { traceEvent });
    }

    const traces: any[] = await ctx.runQuery(api.traces.listForScenario, {
      scenarioId: seeded.scenarioId,
    });

    const teacherTrace = traces.find((trace: any) => trace.actorId === 'teacher') ?? traces[0];
    const admissionsTrace =
      traces.find((trace: any) => trace.actorId === 'admissions-officer') ?? traces[1] ?? traces[0];
    const firstTrace = traces[0];
    const reportInputs = [
      firstTrace && {
        id: `RC-${seeded.scenarioId}-fairness`,
        scenarioId: seeded.scenarioId,
        text:
          'The reform creates a fairness risk unless project support and rubrics make outputs comparable across students.',
        confidence: 'medium' as const,
        evidenceIds: firstTrace.evidenceIds,
        assumptionIds: firstTrace.assumptionIds,
        traceEventIds: [firstTrace.eventId],
      },
      teacherTrace && {
        id: `RC-${seeded.scenarioId}-workload`,
        scenarioId: seeded.scenarioId,
        text:
          'Teacher workload is likely to rise when project assessment requires rubric design, feedback, and moderation.',
        confidence: 'high' as const,
        evidenceIds: teacherTrace.evidenceIds,
        assumptionIds: teacherTrace.assumptionIds,
        traceEventIds: [teacherTrace.eventId],
      },
      admissionsTrace && {
        id: `RC-${seeded.scenarioId}-admissions`,
        scenarioId: seeded.scenarioId,
        text:
          'Admissions trust may drop if universities cannot compare project portfolios across schools.',
        confidence: 'medium' as const,
        evidenceIds: admissionsTrace.evidenceIds,
        assumptionIds: admissionsTrace.assumptionIds,
        traceEventIds: [admissionsTrace.eventId],
      },
    ].filter(Boolean);

    for (const claim of reportInputs) {
      await ctx.runMutation(api.reports.addClaim, { claim });
    }

    const claims: any[] = await ctx.runQuery(api.reports.listClaims, {
      scenarioId: seeded.scenarioId,
    });
    const evidence: any[] = await ctx.runQuery(api.evidence.listForScenario, {
      scenarioId: seeded.scenarioId,
    });
    const assumptions: any[] = await ctx.runQuery(api.assumptions.listForScenario, {
      scenarioId: seeded.scenarioId,
    });

    const metricDeltas = traces.reduce((acc: Record<string, number>, trace: any) => {
      for (const [metricId, delta] of Object.entries(trace.metricDeltas ?? {})) {
        acc[metricId] = (acc[metricId] ?? 0) + Number(delta);
      }
      return acc;
    }, {});

    const visualZones = compiledState.zones.map((zone: any) => ({
      ...zone,
      ...(zoneLayout[zone.id] ?? {
        x: zone.x * 8,
        y: zone.y * 6,
        width: 190,
        height: 125,
        color: 0x8fbf6f,
      }),
    }));
    const zonesById = new Map(visualZones.map((zone: any) => [zone.id, zone]));
    const visualAgents = compiledState.agents.map((agent: any, index: number) => {
      const zone = zonesById.get(agent.zoneId) as any;
      const offset = agentOffsets[agent.id] ?? { dx: 80, dy: 65, row: index % 6 };
      return {
        ...agent,
        x: (zone?.x ?? agent.x * 8) + offset.dx,
        y: (zone?.y ?? agent.y * 6) + offset.dy,
        spriteRow: offset.row,
      };
    });
    const visualMetrics = compiledState.metrics.map((metric: any) => ({
      ...metric,
      value: clampMetric(metric.value + (metricDeltas[metric.id] ?? 0)),
    }));

    return {
      question,
      scenarioId: seeded.scenarioId,
      providerCalls: llmResult.providerCalls,
      pipelineSteps: pipelineSteps(),
      compiledState: {
        tick: compiledState.tick + 1,
        status: 'visualized',
        zones: visualZones,
        agents: visualAgents,
        metrics: visualMetrics,
      },
      agentDecisions: decisions.map((decision) => ({
        id: decision.id,
        agentId: decision.agentId,
        observation: decision.observation,
        retrievedEvidenceIds: decision.retrievedEvidenceIds,
        retrievedAssumptionIds: decision.retrievedAssumptionIds,
        proposedAction: decision.proposedAction,
        reason: decision.reason,
        confidence: decision.confidence,
      })),
      traceEvents: traces.map((trace: any) => ({
        id: trace.eventId,
        tick: trace.tick,
        actorId: trace.actorId,
        actionType: trace.actionType,
        reason: trace.reason,
        evidenceIds: trace.evidenceIds,
        assumptionIds: trace.assumptionIds,
        metricDeltas: trace.metricDeltas,
      })),
      reportClaims: claims.map((claim: any) => ({
        id: claim.claimId,
        text: claim.text,
        confidence: claim.confidence,
        evidenceIds: claim.evidenceIds,
        assumptionIds: claim.assumptionIds,
        traceEventIds: claim.traceEventIds,
      })),
      retrievalResults: buildRetrievalResults(evidence, assumptions, traces),
      reportSummary: {
        text:
          'AI-assisted project assessment can broaden evaluation, but the trace shows fairness, workload, and admissions comparability risks that require explicit guardrails.',
        confidence: confidenceFromCount(claims.length),
      },
    };
  },
});
