import type { PipelineRunResult } from '../../lib/demoSchema';

export function AuditableReport({ result }: { result: PipelineRunResult }) {
  return (
    <section className="panel report-panel">
      <h2>Auditable Report</h2>
      <div className="claim-list">
        {result.reportClaims.map((claim) => (
          <article key={claim.id} className="claim-card">
            <div className="claim-head">
              <strong>{claim.id}</strong>
              <span>{claim.confidence}</span>
            </div>
            <p>{claim.text}</p>
            <small>
              Evidence {claim.evidenceIds.join(', ')} · Assumptions{' '}
              {claim.assumptionIds.join(', ')} · Trace {claim.traceEventIds.join(', ')}
            </small>
          </article>
        ))}
      </div>
    </section>
  );
}
