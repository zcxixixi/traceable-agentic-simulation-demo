import { mutation } from './_generated/server';
import { validateWorldSpec, type WorldSpec } from '../shared/harness';

export const educationReformWorldSpec: WorldSpec = {
  id: 'world-education-reform-v1',
  title: 'AI-Assisted Project-Based Assessment Reform',
  theme: 'pixel_campus',
  zones: [
    {
      id: 'classroom',
      name: 'Classroom',
      purpose: 'Students and teachers experience day-to-day assessment changes.',
      x: 18,
      y: 34,
    },
    {
      id: 'teacher-office',
      name: 'Teacher Office',
      purpose: 'Teachers discuss grading workload, rubric design, and cheating risk.',
      x: 44,
      y: 24,
    },
    {
      id: 'principal-office',
      name: 'Principal Office',
      purpose: 'School leadership balances policy compliance, fairness, and operations.',
      x: 68,
      y: 30,
    },
    {
      id: 'admissions-office',
      name: 'University Admissions Office',
      purpose: 'Admissions staff evaluate whether project artifacts are comparable.',
      x: 76,
      y: 64,
    },
    {
      id: 'tutoring-street',
      name: 'Tutoring Street',
      purpose: 'Private tutoring providers adapt to project-based evaluation.',
      x: 30,
      y: 72,
    },
  ],
  stakeholders: [
    {
      id: 'student',
      name: 'Student',
      role: 'High school student',
      goal: 'Gain fair recognition for learning and avoid being disadvantaged.',
      concerns: ['unequal family support', 'unclear grading standards', 'AI misuse accusations'],
      startZoneId: 'classroom',
    },
    {
      id: 'parent',
      name: 'Parent',
      role: 'Family decision-maker',
      goal: 'Protect the child from unfair evaluation and admissions uncertainty.',
      concerns: ['project authenticity', 'extra cost', 'university acceptance'],
      startZoneId: 'classroom',
    },
    {
      id: 'teacher',
      name: 'Teacher',
      role: 'Assessment designer and grader',
      goal: 'Evaluate learning fairly without unsustainable workload.',
      concerns: ['rubric reliability', 'AI-generated work', 'feedback burden'],
      startZoneId: 'teacher-office',
    },
    {
      id: 'principal',
      name: 'Principal',
      role: 'School administrator',
      goal: 'Implement reform while maintaining trust and measurable outcomes.',
      concerns: ['policy risk', 'teacher capacity', 'public trust'],
      startZoneId: 'principal-office',
    },
    {
      id: 'admissions-officer',
      name: 'Admissions Officer',
      role: 'University evaluator',
      goal: 'Compare applicants using reliable and interpretable signals.',
      concerns: ['cross-school comparability', 'authenticity', 'selection fairness'],
      startZoneId: 'admissions-office',
    },
    {
      id: 'tutoring-owner',
      name: 'Tutoring Company Owner',
      role: 'Private education provider',
      goal: 'Adapt services to the new evaluation system.',
      concerns: ['new market demand', 'gaming behavior', 'regulatory scrutiny'],
      startZoneId: 'tutoring-street',
    },
  ],
  interventions: [
    {
      id: 'replace-exams',
      name: 'Replace traditional exams',
      description: 'Traditional exams are replaced with AI-assisted project-based assessment.',
      affectedStakeholderIds: [
        'student',
        'parent',
        'teacher',
        'principal',
        'admissions-officer',
        'tutoring-owner',
      ],
      affectedMetricIds: ['fairness', 'workload', 'admissions-trust', 'gaming-risk'],
    },
    {
      id: 'hybrid-assessment',
      name: 'Hybrid assessment',
      description: 'Project-based assessment is introduced while retaining a reduced exam component.',
      affectedStakeholderIds: ['student', 'teacher', 'principal', 'admissions-officer'],
      affectedMetricIds: ['fairness', 'workload', 'admissions-trust'],
    },
  ],
  assumptions: [
    {
      id: 'A1',
      statement: 'Universities initially trust standardized exams more than project portfolios.',
      confidence: 'medium',
      scope: 'admissions',
      evidenceIds: ['EV1'],
    },
    {
      id: 'A2',
      statement: 'Students with stronger family or tutoring support can produce more polished projects.',
      confidence: 'high',
      scope: 'equity',
      evidenceIds: ['EV2'],
    },
    {
      id: 'A3',
      statement: 'Teacher workload rises unless rubrics and AI feedback tools are carefully designed.',
      confidence: 'medium',
      scope: 'school operations',
      evidenceIds: ['EV3'],
    },
  ],
  evidenceCards: [
    {
      id: 'EV1',
      source: 'Admissions policy memo placeholder',
      claim: 'Admissions systems prefer comparable signals when evaluating applicants across schools.',
      relevance: 'Constrains admissions officer behavior and trust in project portfolios.',
    },
    {
      id: 'EV2',
      source: 'Education equity review placeholder',
      claim: 'Resource differences shape student access to enrichment and project support.',
      relevance: 'Constrains fairness and gaming-risk metrics.',
    },
    {
      id: 'EV3',
      source: 'Teacher workload study placeholder',
      claim: 'Open-ended assessment increases grading and feedback demands without tooling.',
      relevance: 'Constrains teacher workload and implementation risk.',
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
    {
      id: 'admissions-trust',
      name: 'Admissions trust',
      direction: 'increase_good',
      initialValue: 55,
    },
    {
      id: 'gaming-risk',
      name: 'Gaming risk',
      direction: 'decrease_good',
      initialValue: 40,
    },
  ],
};

export const educationReformScenario = mutation({
  handler: async (ctx) => {
    const validation = validateWorldSpec(educationReformWorldSpec);
    if (!validation.ok) {
      throw new Error(`Seed world spec is invalid: ${JSON.stringify(validation.issues)}`);
    }

    const now = Date.now();
    const scenarioId = await ctx.db.insert('scenarios', {
      title: 'Education Evaluation Reform',
      decisionProblem:
        'If high schools replace traditional exams with AI-assisted project-based assessment, what happens?',
      status: 'world_spec_validated',
      createdAt: now,
      updatedAt: now,
    });

    await ctx.db.insert('worldSpecs', {
      scenarioId,
      rawSpec: educationReformWorldSpec,
      validatedSpec: validation.worldSpec,
      validationIssues: [],
      status: 'valid',
      createdAt: now,
    });

    for (const evidence of educationReformWorldSpec.evidenceCards) {
      await ctx.db.insert('evidenceCards', {
        scenarioId,
        evidenceId: evidence.id,
        source: evidence.source,
        claim: evidence.claim,
        relevance: evidence.relevance,
        createdAt: now,
      });
    }

    for (const assumption of educationReformWorldSpec.assumptions) {
      await ctx.db.insert('assumptions', {
        scenarioId,
        assumptionId: assumption.id,
        statement: assumption.statement,
        confidence: assumption.confidence,
        scope: assumption.scope,
        evidenceIds: assumption.evidenceIds,
        createdAt: now,
      });
    }

    return { scenarioId };
  },
});
