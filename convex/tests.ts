import { v } from 'convex/values';
import { action } from './_generated/server';
import { api } from './_generated/api';
import { educationReformWorldSpec } from './seed';

type TestResult = {
  module: string;
  name: string;
  ok: boolean;
  detail?: string;
};

function pass(module: string, name: string, detail?: string): TestResult {
  return { module, name, ok: true, detail };
}

function fail(module: string, name: string, error: unknown): TestResult {
  return {
    module,
    name,
    ok: false,
    detail: error instanceof Error ? error.message : JSON.stringify(error),
  };
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

async function expectThrows(fn: () => Promise<unknown>, expected: string) {
  try {
    await fn();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (!message.includes(expected)) {
      throw new Error(`Expected error containing "${expected}", got "${message}"`);
    }
    return;
  }
  throw new Error(`Expected error containing "${expected}", but function succeeded`);
}

export const runAll = action({
  args: {
    verbose: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const results: TestResult[] = [];

    let scenarioId: string | undefined;

    try {
      scenarioId = await ctx.runMutation(api.scenarios.create, {
        title: 'Harness Test Scenario',
        decisionProblem:
          'If high schools replace traditional exams with AI-assisted project-based assessment, what happens?',
      });
      const scenario = await ctx.runQuery(api.scenarios.get, { scenarioId: scenarioId as any });
      assert(scenario?.status === 'draft', 'Scenario should start in draft status');
      results.push(pass('Scenario', 'create/get', scenarioId));
    } catch (error) {
      results.push(fail('Scenario', 'create/get', error));
    }

    if (!scenarioId) {
      return { ok: false, results };
    }

    try {
      const seeded = await ctx.runMutation(api.seed.educationReformScenario);
      const evidence = await ctx.runQuery(api.evidence.listForScenario, {
        scenarioId: seeded.scenarioId,
      });
      const assumptions = await ctx.runQuery(api.assumptions.listForScenario, {
        scenarioId: seeded.scenarioId,
      });
      assert(evidence.length === 3, `Expected 3 evidence cards, got ${evidence.length}`);
      assert(assumptions.length === 3, `Expected 3 assumptions, got ${assumptions.length}`);
      assert(
        assumptions.every((assumption: any) => assumption.evidenceIds.length > 0),
        'Every seeded assumption should link to evidence',
      );
      results.push(pass('Evidence/Assumption', 'seed data persisted', seeded.scenarioId));
    } catch (error) {
      results.push(fail('Evidence/Assumption', 'seed data persisted', error));
    }

    try {
      const response = await ctx.runMutation(api.worldSpecs.submit, {
        scenarioId: scenarioId as any,
        rawSpec: educationReformWorldSpec,
      });
      assert(response.validation.ok === true, 'Valid WorldSpec should pass validation');
      const latest = await ctx.runQuery(api.worldSpecs.latestForScenario, {
        scenarioId: scenarioId as any,
      });
      assert(latest?.status === 'valid', 'Latest WorldSpec should be valid');
      results.push(pass('WorldSpec/Harness', 'valid spec accepted', response.worldSpecId));
    } catch (error) {
      results.push(fail('WorldSpec/Harness', 'valid spec accepted', error));
    }

    try {
      const invalidSpec = {
        ...educationReformWorldSpec,
        stakeholders: [
          {
            ...educationReformWorldSpec.stakeholders[0],
            startZoneId: 'missing-zone',
          },
          ...educationReformWorldSpec.stakeholders.slice(1),
        ],
      };
      const badScenarioId = await ctx.runMutation(api.scenarios.create, {
        title: 'Invalid Harness Test Scenario',
        decisionProblem: 'Invalid world spec should be rejected.',
      });
      const response = await ctx.runMutation(api.worldSpecs.submit, {
        scenarioId: badScenarioId,
        rawSpec: invalidSpec,
      });
      assert(response.validation.ok === false, 'Invalid WorldSpec should fail validation');
      assert(
        response.validation.issues.some((issue: any) => issue.message.includes('Unknown zone id')),
        'Invalid WorldSpec should report the missing zone',
      );
      results.push(pass('WorldSpec/Harness', 'invalid spec rejected'));
    } catch (error) {
      results.push(fail('WorldSpec/Harness', 'invalid spec rejected', error));
    }

    try {
      const compileScenarioId = await ctx.runMutation(api.seed.educationReformScenario);
      const compileResult = await ctx.runMutation(api.compiler.compileScenario, {
        scenarioId: compileScenarioId.scenarioId,
        activeInterventionId: 'replace-exams',
      });
      const simulationState = await ctx.runQuery(api.compiler.latestState, {
        scenarioId: compileScenarioId.scenarioId,
      });
      assert(compileResult.status === 'compiled', 'Compiler should return compiled status');
      assert(simulationState?.tick === 0, 'Compiled SimulationState should start at tick 0');
      assert(simulationState?.agents.length === 6, 'Compiler should create one agent per stakeholder');
      assert(simulationState?.metrics.length === 4, 'Compiler should initialize all metrics');
      results.push(pass('Compiler', 'valid WorldSpec compiled', compileResult.simulationStateId));
    } catch (error) {
      results.push(fail('Compiler', 'valid WorldSpec compiled', error));
    }

    try {
      const runtimeScenarioId = await ctx.runMutation(api.seed.educationReformScenario);
      await ctx.runMutation(api.compiler.compileScenario, {
        scenarioId: runtimeScenarioId.scenarioId,
        activeInterventionId: 'replace-exams',
      });
      const runResult = await ctx.runMutation(api.runtime.runStep, {
        scenarioId: runtimeScenarioId.scenarioId,
      });
      const simulationState = await ctx.runQuery(api.compiler.latestState, {
        scenarioId: runtimeScenarioId.scenarioId,
      });
      const traces = await ctx.runQuery(api.traces.listForScenario, {
        scenarioId: runtimeScenarioId.scenarioId,
      });
      assert(runResult.tick === 1, 'Runtime should advance to tick 1');
      assert(runResult.processedEventCount === 1, 'Runtime should process one queued event');
      assert(runResult.traceEventCount === 6, 'Runtime should create one trace per target agent');
      assert(simulationState?.status === 'completed', 'Runtime should complete when queue is empty');
      assert(traces.length >= 6, 'Runtime traces should persist');
      results.push(pass('Runtime', 'one step executed', String(runResult.tick)));
    } catch (error) {
      results.push(fail('Runtime', 'one step executed', error));
    }

    try {
      const loopScenarioId = await ctx.runMutation(api.seed.educationReformScenario);
      await ctx.runMutation(api.compiler.compileScenario, {
        scenarioId: loopScenarioId.scenarioId,
        activeInterventionId: 'replace-exams',
      });
      const started = await ctx.runMutation(api.simulationLoop.startFromCompiledScenario, {
        scenarioId: loopScenarioId.scenarioId,
        maxTicks: 1,
        tickIntervalMs: 1000,
        autoStart: false,
      });
      const tickResult = await ctx.runMutation(api.simulationLoop.tickWorld, {
        runId: started.runId,
        scheduleNext: false,
      });
      const snapshot = await ctx.runQuery(api.simulationLoop.getRunSnapshot, {
        runId: started.runId as any,
      });
      assert(tickResult.tick === 1, 'Simulation loop should advance to tick 1');
      assert(tickResult.status === 'completed', 'Simulation loop should complete at maxTicks=1');
      assert(snapshot?.agents.length === 6, 'Simulation loop should persist live agents');
      assert(snapshot?.events.length >= 7, 'Simulation loop should persist world events');
      assert(snapshot?.traces.length >= 6, 'Simulation loop should persist trace events');
      assert(snapshot?.world?.tick === 1, 'Simulation loop should update world tick');
      results.push(pass('SimulationLoop', 'real backend loop executed', String(started.runId)));
    } catch (error) {
      results.push(fail('SimulationLoop', 'real backend loop executed', error));
    }

    try {
      const started = await ctx.runAction(api.simulationLoop.startEducationReformTown, {
        question:
          'If high schools replace traditional exams with AI-assisted project-based assessment, what happens?',
        maxTicks: 1,
        tickIntervalMs: 1000,
      });
      const snapshot = await ctx.runQuery(api.simulationLoop.getRunSnapshot, {
        runId: started.runId as any,
      });
      assert(started.scenarioId, 'Real town action should return a scenarioId');
      assert(started.worldId, 'Real town action should return a worldId');
      assert(started.runId, 'Real town action should return a runId');
      assert(snapshot?.world, 'Real town action should create a world');
      assert(snapshot?.agents.length === 6, 'Real town action should create live agents');
      results.push(pass('SimulationLoop', 'education reform town started', String(started.runId)));
    } catch (error) {
      results.push(fail('SimulationLoop', 'education reform town started', error));
    }

    try {
      const agentScenarioId = await ctx.runMutation(api.seed.educationReformScenario);
      await ctx.runMutation(api.compiler.compileScenario, {
        scenarioId: agentScenarioId.scenarioId,
        activeInterventionId: 'replace-exams',
      });
      const decisionResult = await ctx.runMutation(api.agents.decideForScenario, {
        scenarioId: agentScenarioId.scenarioId,
      });
      const decisions = await ctx.runQuery(api.agents.listForScenario, {
        scenarioId: agentScenarioId.scenarioId,
      });
      assert(decisionResult.tick === 0, 'Agent decisions should be made against current tick 0');
      assert(decisionResult.decisionCount === 6, 'Agent module should decide once per targeted agent');
      assert(decisions.length >= 6, 'Agent decisions should persist');
      assert(
        decisionResult.decisions.every((decision: any) => decision.retrievedEvidenceIds.length > 0),
        'Every agent decision should carry evidence grounding',
      );
      assert(
        decisionResult.decisions.every((decision: any) => decision.retrievedAssumptionIds.length > 0),
        'Every agent decision should carry assumption grounding',
      );
      results.push(pass('Agent', 'grounded decisions generated', String(decisionResult.decisionCount)));
    } catch (error) {
      results.push(fail('Agent', 'grounded decisions generated', error));
    }

    try {
      const traceEvent = {
        id: `TE-${Date.now()}`,
        tick: 1,
        scenarioId,
        actorId: 'teacher',
        actionType: 'raise_workload_concern',
        actionPayload: {
          concern: 'Project rubrics and feedback require additional grading time.',
        },
        reason:
          'Teacher workload is directly affected by replacing exams with project-based assessment.',
        evidenceIds: ['EV3'],
        assumptionIds: ['A3'],
        stateBefore: { workload: 45 },
        stateAfter: { workload: 58 },
        metricDeltas: { workload: 13 },
      };
      await ctx.runMutation(api.traces.append, { traceEvent });
      const traces = await ctx.runQuery(api.traces.listForScenario, {
        scenarioId: scenarioId as any,
      });
      assert(traces.some((trace: any) => trace.eventId === traceEvent.id), 'Trace event should persist');
      results.push(pass('Trace', 'valid trace accepted', traceEvent.id));
    } catch (error) {
      results.push(fail('Trace', 'valid trace accepted', error));
    }

    try {
      await expectThrows(
        () =>
          ctx.runMutation(api.traces.append, {
            traceEvent: {
              id: `TE-BAD-${Date.now()}`,
              tick: 2,
              scenarioId,
              actorId: 'unknown-actor',
              actionType: 'bad_action',
              actionPayload: {},
              reason: 'This should fail reference validation.',
              evidenceIds: ['EV3'],
              assumptionIds: ['A3'],
              stateBefore: {},
              stateAfter: {},
              metricDeltas: { workload: 1 },
            },
          }),
        'unknown actor',
      );
      results.push(pass('Trace', 'invalid actor rejected'));
    } catch (error) {
      results.push(fail('Trace', 'invalid actor rejected', error));
    }

    try {
      const traces = await ctx.runQuery(api.traces.listForScenario, {
        scenarioId: scenarioId as any,
      });
      const firstTrace = traces[0];
      assert(firstTrace, 'Report test requires at least one trace event');

      const claim = {
        id: `RC-${Date.now()}`,
        scenarioId,
        text:
          'Teacher workload is likely to rise unless project rubrics and AI feedback workflows are carefully designed.',
        confidence: 'medium' as const,
        evidenceIds: ['EV3'],
        assumptionIds: ['A3'],
        traceEventIds: [firstTrace.eventId],
      };
      await ctx.runMutation(api.reports.addClaim, { claim });
      const claims = await ctx.runQuery(api.reports.listClaims, {
        scenarioId: scenarioId as any,
      });
      assert(claims.some((item: any) => item.claimId === claim.id), 'Report claim should persist');
      results.push(pass('Report', 'valid claim accepted', claim.id));
    } catch (error) {
      results.push(fail('Report', 'valid claim accepted', error));
    }

    try {
      await expectThrows(
        () =>
          ctx.runMutation(api.reports.addClaim, {
            claim: {
              id: `RC-BAD-${Date.now()}`,
              scenarioId,
              text: 'This should fail because it references a missing trace event.',
              confidence: 'low',
              evidenceIds: ['EV3'],
              assumptionIds: ['A3'],
              traceEventIds: ['missing-trace-event'],
            },
          }),
        'unknown trace event',
      );
      results.push(pass('Report', 'invalid trace reference rejected'));
    } catch (error) {
      results.push(fail('Report', 'invalid trace reference rejected', error));
    }

    const ok = results.every((result) => result.ok);
    if (args.verbose || !ok) {
      console.log(JSON.stringify(results, null, 2));
    }
    return { ok, results };
  },
});
