import type { PipelineRunResult } from '../../lib/demoSchema';

export function PipelineTimeline({ result }: { result: PipelineRunResult }) {
  return (
    <section className="panel timeline-panel">
      <h2>Pipeline</h2>
      <div className="step-list">
        {result.pipelineSteps.map((step) => (
          <div key={step.id} className="step-row">
            <span className="step-index">{step.id}</span>
            <span>{step.name}</span>
          </div>
        ))}
      </div>
    </section>
  );
}
