import type { VisualTraceEvent } from '../../lib/demoSchema';

type Props = {
  traces: VisualTraceEvent[];
  selectedTraceId?: string;
  onSelectTrace: (traceId: string, actorId: string) => void;
};

export function TraceTimeline({ traces, selectedTraceId, onSelectTrace }: Props) {
  return (
    <section className="panel trace-panel">
      <h2>Trace</h2>
      <div className="trace-list">
        {traces.map((trace) => (
          <button
            key={trace.id}
            type="button"
            className={trace.id === selectedTraceId ? 'trace-card trace-active' : 'trace-card'}
            onClick={() => onSelectTrace(trace.id, trace.actorId)}
          >
            <span>Tick {trace.tick}</span>
            <strong>{trace.actorId}</strong>
            <p>{trace.actionType}</p>
            <small>
              {trace.evidenceIds.join(', ')} · {trace.assumptionIds.join(', ')}
            </small>
          </button>
        ))}
      </div>
    </section>
  );
}
