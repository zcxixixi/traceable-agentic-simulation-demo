import { ConvexHttpClient } from 'convex/browser';
import { api } from '../../../convex/_generated/api';
import type { PipelineRunResult } from './demoSchema';

const convexUrl = import.meta.env.VITE_CONVEX_URL || 'http://127.0.0.1:3210';
const client = new ConvexHttpClient(convexUrl);

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

const pipelineStepNames = [
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
];

type RealTownStart = {
  scenarioId: string;
  worldId: string;
  runId: string;
};

type RealTownSnapshot = {
  run: {
    _id: string;
    status: string;
    tick: number;
    maxTicks: number;
  };
  world: {
    tick: number;
    status: string;
    zones: Array<{ id: string; name: string; purpose: string; x: number; y: number }>;
    metrics: Array<{
      id: string;
      name: string;
      direction: 'increase_good' | 'decrease_good' | 'contextual';
      value: number;
    }>;
  } | null;
  agents: Array<{
    agentId: string;
    name: string;
    role: string;
    goals: string[];
    concerns: string[];
    locationZoneId: string;
    currentAction?: string;
    state: {
      satisfaction: number;
      trust: number;
      stress: number;
      influence: number;
    };
  }>;
  events: Array<{
    _id: string;
    tick: number;
    type: string;
    actorAgentId?: string;
    payload: Record<string, unknown>;
  }>;
  traces: Array<{
    eventId: string;
    tick: number;
    actorId: string;
    actionType: string;
    actionPayload: {
      payload?: {
        targetZoneId?: string;
      };
      metricEffects?: Record<string, number>;
    };
    reason: string;
    evidenceIds: string[];
    assumptionIds: string[];
    metricDeltas?: Record<string, number>;
  }>;
};

export async function runEducationReformPipeline(
  question: string,
  maxAgents: number,
): Promise<PipelineRunResult> {
  const result = await client.action(api.pipeline.runEducationReformDemo, {
    question,
    maxAgents,
  });
  return result as unknown as PipelineRunResult;
}

function targetZoneFromTrace(trace: RealTownSnapshot['traces'][number]) {
  return trace.actionPayload?.payload?.targetZoneId;
}

function toVisualWorld(snapshot: RealTownSnapshot): PipelineRunResult {
  const world = snapshot.world;
  const visualZones = (world?.zones ?? []).map((zone) => ({
    ...zone,
    ...(zoneLayout[zone.id] ?? {
      x: zone.x * 8,
      y: zone.y * 6,
      width: 190,
      height: 125,
      color: 0x8fbf6f,
    }),
  }));
  const zonesById = new Map(visualZones.map((zone) => [zone.id, zone]));

  const visualAgents = snapshot.agents.map((agent, index) => {
    const zone = zonesById.get(agent.locationZoneId);
    const offset = agentOffsets[agent.agentId] ?? { dx: 80, dy: 65, row: index % 6 };
    return {
      id: agent.agentId,
      name: agent.name,
      role: agent.role,
      goal: agent.goals[0] ?? agent.currentAction ?? 'Act inside the town.',
      concerns: agent.concerns,
      zoneId: agent.locationZoneId,
      x: (zone?.x ?? 120) + offset.dx,
      y: (zone?.y ?? 120) + offset.dy,
      spriteRow: offset.row,
      state: agent.state,
    };
  });

  const traceEvents = snapshot.traces.map((trace) => ({
    id: trace.eventId,
    tick: trace.tick,
    actorId: trace.actorId,
    actionType: trace.actionType,
    targetZoneId: targetZoneFromTrace(trace),
    reason: trace.reason,
    evidenceIds: trace.evidenceIds,
    assumptionIds: trace.assumptionIds,
    metricDeltas: trace.metricDeltas ?? trace.actionPayload?.metricEffects ?? {},
  }));

  return {
    question: 'Real backend AI town run',
    pipelineSteps: pipelineStepNames.map((name, index) => ({
      id: index + 1,
      name,
      status: 'done',
    })),
    compiledState: {
      tick: world?.tick ?? snapshot.run.tick,
      status: world?.status ?? snapshot.run.status,
      zones: visualZones,
      agents: visualAgents,
      metrics: world?.metrics ?? [],
    },
    agentDecisions: snapshot.agents.map((agent) => ({
      id: agent.currentAction ? `live-${snapshot.run._id}-${agent.agentId}` : `idle-${agent.agentId}`,
      agentId: agent.agentId,
      observation: `${agent.name} is ${agent.currentAction ?? 'waiting'} in ${agent.locationZoneId}.`,
      retrievedEvidenceIds: [],
      retrievedAssumptionIds: [],
      proposedAction: {
        type: agent.currentAction ?? 'idle',
        targetIds: [agent.locationZoneId],
        payload: { targetZoneId: agent.locationZoneId },
        metricEffects: {},
      },
      reason: `${agent.name} current backend status is ${agent.currentAction ?? 'idle'}.`,
      confidence: 'medium',
    })),
    traceEvents,
    reportClaims: traceEvents.slice(-3).map((trace, index) => ({
      id: `live-claim-${trace.id}`,
      text: `${trace.actorId} performed ${trace.actionType}; the trace links this action to evidence, assumptions, memory, and metric changes.`,
      confidence: index === 0 ? 'medium' : 'low',
      evidenceIds: trace.evidenceIds,
      assumptionIds: trace.assumptionIds,
      traceEventIds: [trace.id],
    })),
    retrievalResults: [
      ...snapshot.events.slice(-2).map((event) => ({
        id: String(event._id),
        kind: 'trace' as const,
        title: event.type,
        text: `World event at tick ${event.tick}`,
        score: 0.8,
      })),
      ...traceEvents.slice(-2).map((trace) => ({
        id: trace.id,
        kind: 'trace' as const,
        title: trace.actionType,
        text: trace.reason,
        score: 0.76,
      })),
    ],
  };
}

export async function runRealTown(
  question: string,
  maxTicks = 6,
  tickIntervalMs = 1500,
): Promise<RealTownStart> {
  const result = await client.action(api.simulationLoop.startEducationReformTown, {
    question,
    maxTicks,
    tickIntervalMs,
    decisionProvider: 'deterministic',
  });
  return result as unknown as RealTownStart;
}

export async function loadRealTownSnapshot(runId: string): Promise<PipelineRunResult> {
  const snapshot = await client.query(api.simulationLoop.getRunSnapshot, {
    runId: runId as never,
  });
  if (!snapshot) {
    throw new Error(`Real town run not found: ${runId}`);
  }
  return toVisualWorld(snapshot as unknown as RealTownSnapshot);
}
