import { v } from 'convex/values';
import { action } from './_generated/server';
import { api } from './_generated/api';
import {
  agentDecisionSchema,
  simulationStateSchema,
  type AgentDecision,
  type SimulationState,
} from '../shared/harness';

declare const process: {
  env: Record<string, string | undefined>;
};

type RuntimeAgent = SimulationState['agents'][number];
type RuntimeEvent = SimulationState['eventQueue'][number] | undefined;

type EvidenceRow = {
  evidenceId: string;
  source: string;
  claim: string;
  relevance: string;
};

type AssumptionRow = {
  assumptionId: string;
  statement: string;
  confidence: AgentDecision['confidence'];
  scope: string;
  evidenceIds: string[];
};

type ChatMessage = {
  role: 'system' | 'user';
  content: string;
};

type LlmDecideResult = {
  scenarioId: string;
  tick: number;
  decisionCount: number;
  savedCount: number;
  decisions: AgentDecision[];
  providerCalls: Array<{
    agentId: string;
    model: string;
    usage: unknown;
  }>;
};

function getEnv(name: string) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required Convex env var: ${name}`);
  }
  return value;
}

function extractInterventionId(event: RuntimeEvent, fallback: string) {
  if (
    typeof event?.payload === 'object' &&
    event.payload &&
    'interventionId' in event.payload &&
    typeof event.payload.interventionId === 'string'
  ) {
    return event.payload.interventionId;
  }
  return fallback;
}

function buildObservation(agent: RuntimeAgent, state: SimulationState, event: RuntimeEvent) {
  const eventText = event
    ? `next event "${event.type}" targets ${event.targetAgentIds.join(', ')}`
    : 'no queued event';
  return `${agent.name} is in ${agent.zoneId}; trust=${agent.state.trust}, stress=${agent.state.stress}; ${eventText}.`;
}

function compactStateForPrompt(state: SimulationState, event: RuntimeEvent) {
  return {
    scenarioId: state.scenarioId,
    tick: state.tick,
    activeInterventionId: state.activeInterventionId,
    nextEvent: event,
    zones: state.zones.map((zone) => ({
      id: zone.id,
      name: zone.name,
      purpose: zone.purpose,
    })),
    metrics: state.metrics.map((metric) => ({
      id: metric.id,
      name: metric.name,
      direction: metric.direction,
      value: metric.value,
    })),
  };
}

function buildMessages(args: {
  state: SimulationState;
  agent: RuntimeAgent;
  event: RuntimeEvent;
  evidence: EvidenceRow[];
  assumptions: AssumptionRow[];
}): ChatMessage[] {
  const observation = buildObservation(args.agent, args.state, args.event);
  const interventionId = extractInterventionId(args.event, args.state.activeInterventionId);
  const metricIds = args.state.metrics.map((metric) => metric.id);
  const evidenceIds = args.evidence.map((item) => item.evidenceId);
  const assumptionIds = args.assumptions.map((item) => item.assumptionId);

  return [
    {
      role: 'system',
      content:
        'You are a bounded simulation agent. Return only one valid JSON object. Do not use markdown. Do not invent IDs. The JSON must match the requested AgentDecision shape exactly.',
    },
    {
      role: 'user',
      content: JSON.stringify(
        {
          task:
            'Create one AgentDecision for this agent. Use only the provided IDs. Metric effects must be small integers from -5 to 5. Include at least one evidence ID and one assumption ID.',
          requiredShape: {
            id: `AD-${args.state.scenarioId}-${args.state.tick}-${args.agent.id}-llm`,
            scenarioId: args.state.scenarioId,
            tick: args.state.tick,
            agentId: args.agent.id,
            observation,
            retrievedEvidenceIds: ['one or more IDs from allowedEvidenceIds'],
            retrievedAssumptionIds: ['one or more IDs from allowedAssumptionIds'],
            proposedAction: {
              type: 'snake_case_action_name',
              targetIds: [interventionId, 'metric IDs affected by the action'],
              payload: {
                agentRole: args.agent.role,
                goal: args.agent.goal,
                primaryConcern: args.agent.concerns[0],
                interventionId,
              },
              metricEffects: {
                [metricIds[0] ?? 'metric-id']: 0,
              },
            },
            reason: 'one concise sentence explaining why the agent chose this action',
            confidence: 'low | medium | high',
          },
          allowedEvidenceIds: evidenceIds,
          allowedAssumptionIds: assumptionIds,
          allowedMetricIds: metricIds,
          allowedAgentId: args.agent.id,
          world: compactStateForPrompt(args.state, args.event),
          agent: args.agent,
          evidence: args.evidence,
          assumptions: args.assumptions,
        },
        null,
        2,
      ),
    },
  ];
}

function parseJsonObject(content: string) {
  const trimmed = content.trim();
  if (trimmed.startsWith('{')) {
    return JSON.parse(trimmed);
  }

  const match = trimmed.match(/\{[\s\S]*\}/);
  if (!match) {
    throw new Error(`LLM response did not contain a JSON object: ${trimmed.slice(0, 200)}`);
  }
  return JSON.parse(match[0]);
}

async function callOpenAiCompatibleProvider(messages: ChatMessage[]) {
  const baseUrl = getEnv('LLM_API_BASE_URL').replace(/\/$/, '');
  const apiKey = getEnv('LLM_API_KEY');
  const model = getEnv('LLM_MODEL');

  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${apiKey}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model,
      messages,
      temperature: 0.2,
      response_format: { type: 'json_object' },
    }),
  });

  const text = await response.text();
  if (!response.ok) {
    throw new Error(`LLM API request failed with ${response.status}: ${text.slice(0, 500)}`);
  }

  const payload = JSON.parse(text);
  const content = payload?.choices?.[0]?.message?.content;
  if (typeof content !== 'string' || content.length === 0) {
    throw new Error(`LLM API response missing choices[0].message.content`);
  }

  return {
    model,
    content,
    usage: payload.usage ?? null,
  };
}

function validateLocalReferences(args: {
  decision: AgentDecision;
  state: SimulationState;
  evidence: EvidenceRow[];
  assumptions: AssumptionRow[];
}) {
  const agentIds = new Set(args.state.agents.map((agent) => agent.id));
  if (!agentIds.has(args.decision.agentId)) {
    throw new Error(`LLM decision references unknown agent: ${args.decision.agentId}`);
  }

  const metricIds = new Set(args.state.metrics.map((metric) => metric.id));
  for (const metricId of Object.keys(args.decision.proposedAction.metricEffects)) {
    if (!metricIds.has(metricId)) {
      throw new Error(`LLM decision references unknown metric: ${metricId}`);
    }
  }

  const evidenceIds = new Set(args.evidence.map((item) => item.evidenceId));
  for (const evidenceId of args.decision.retrievedEvidenceIds) {
    if (!evidenceIds.has(evidenceId)) {
      throw new Error(`LLM decision references unknown evidence: ${evidenceId}`);
    }
  }

  const assumptionIds = new Set(args.assumptions.map((item) => item.assumptionId));
  for (const assumptionId of args.decision.retrievedAssumptionIds) {
    if (!assumptionIds.has(assumptionId)) {
      throw new Error(`LLM decision references unknown assumption: ${assumptionId}`);
    }
  }
}

export const decideForScenario = action({
  args: {
    scenarioId: v.id('scenarios'),
    maxAgents: v.optional(v.number()),
  },
  handler: async (ctx, args): Promise<LlmDecideResult> => {
    const stateDoc = await ctx.runQuery(api.compiler.latestState, {
      scenarioId: args.scenarioId,
    });
    if (!stateDoc) {
      throw new Error(`Scenario must be compiled before LLM agents can decide: ${args.scenarioId}`);
    }

    const state = simulationStateSchema.parse({
      scenarioId: stateDoc.scenarioId,
      tick: stateDoc.tick,
      status: stateDoc.status,
      zones: stateDoc.zones,
      agents: stateDoc.agents,
      metrics: stateDoc.metrics,
      activeInterventionId: stateDoc.activeInterventionId,
      eventQueue: stateDoc.eventQueue,
    });
    const evidence = (await ctx.runQuery(api.evidence.listForScenario, {
      scenarioId: args.scenarioId,
    })) as EvidenceRow[];
    const assumptions = (await ctx.runQuery(api.assumptions.listForScenario, {
      scenarioId: args.scenarioId,
    })) as AssumptionRow[];

    const nextEvent = [...state.eventQueue].sort((a, b) => a.tick - b.tick)[0];
    const targetAgentIds = new Set(nextEvent?.targetAgentIds ?? state.agents.map((agent) => agent.id));
    const maxAgents = Math.max(1, Math.floor(args.maxAgents ?? 1));
    const targetAgents = state.agents.filter((agent) => targetAgentIds.has(agent.id)).slice(0, maxAgents);
    const decisions: AgentDecision[] = [];
    const providerCalls: LlmDecideResult['providerCalls'] = [];

    for (const agent of targetAgents) {
      const messages = buildMessages({ state, agent, event: nextEvent, evidence, assumptions });
      const providerResult = await callOpenAiCompatibleProvider(messages);
      const parsed = parseJsonObject(providerResult.content);
      const decision = agentDecisionSchema.parse(parsed);

      if (decision.id !== `AD-${state.scenarioId}-${state.tick}-${agent.id}-llm`) {
        throw new Error(`LLM decision id mismatch for ${agent.id}: ${decision.id}`);
      }
      if (decision.scenarioId !== state.scenarioId || decision.tick !== state.tick || decision.agentId !== agent.id) {
        throw new Error(`LLM decision context mismatch for ${agent.id}`);
      }
      validateLocalReferences({ decision, state, evidence, assumptions });

      decisions.push(decision);
      providerCalls.push({
        agentId: agent.id,
        model: providerResult.model,
        usage: providerResult.usage,
      });
    }

    const saveResult: { savedCount: number; decisionIds: unknown[] } = await ctx.runMutation(
      api.agents.saveValidatedDecisions,
      {
        scenarioId: args.scenarioId,
        decisions,
      },
    );

    return {
      scenarioId: args.scenarioId,
      tick: state.tick,
      decisionCount: decisions.length,
      savedCount: saveResult.savedCount,
      decisions,
      providerCalls,
    };
  },
});
