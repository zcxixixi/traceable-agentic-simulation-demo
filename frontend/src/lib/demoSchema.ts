export type PipelineStepStatus = 'pending' | 'running' | 'done';

export type VisualZone = {
  id: string;
  name: string;
  purpose: string;
  x: number;
  y: number;
  width: number;
  height: number;
  color: number;
};

export type VisualAgent = {
  id: string;
  name: string;
  role: string;
  goal: string;
  concerns: string[];
  zoneId: string;
  x: number;
  y: number;
  spriteRow: number;
  state: {
    satisfaction: number;
    trust: number;
    stress: number;
    influence: number;
  };
};

export type VisualTraceEvent = {
  id: string;
  tick: number;
  actorId: string;
  actionType: string;
  targetZoneId?: string;
  reason: string;
  evidenceIds: string[];
  assumptionIds: string[];
  metricDeltas: Record<string, number>;
};

export type VisualMetric = {
  id: string;
  name: string;
  value: number;
  direction: 'increase_good' | 'decrease_good' | 'contextual';
};

export type AgentDecision = {
  id: string;
  agentId: string;
  observation: string;
  retrievedEvidenceIds: string[];
  retrievedAssumptionIds: string[];
  proposedAction: {
    type: string;
    targetIds: string[];
    payload?: {
      targetZoneId?: string;
      [key: string]: unknown;
    };
    metricEffects: Record<string, number>;
  };
  reason: string;
  confidence: 'low' | 'medium' | 'high';
};

export type ReportClaim = {
  id: string;
  text: string;
  confidence: 'low' | 'medium' | 'high';
  evidenceIds: string[];
  assumptionIds: string[];
  traceEventIds: string[];
};

export type RetrievalResult = {
  id: string;
  kind: 'evidence' | 'assumption' | 'trace';
  title: string;
  text: string;
  score: number;
};

export type PipelineRunResult = {
  question: string;
  pipelineSteps: Array<{
    id: number;
    name: string;
    status: PipelineStepStatus;
  }>;
  compiledState: {
    tick: number;
    status: string;
    zones: VisualZone[];
    agents: VisualAgent[];
    metrics: VisualMetric[];
  };
  agentDecisions: AgentDecision[];
  traceEvents: VisualTraceEvent[];
  reportClaims: ReportClaim[];
  retrievalResults: RetrievalResult[];
};
