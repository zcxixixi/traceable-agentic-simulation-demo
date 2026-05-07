import type { VisualMetric } from '../../lib/demoSchema';

function scoreClass(metric: VisualMetric) {
  if (metric.direction === 'contextual') return 'metric-neutral';
  const good =
    metric.direction === 'increase_good' ? metric.value >= 50 : metric.value <= 50;
  return good ? 'metric-good' : 'metric-risk';
}

export function MetricPanel({ metrics }: { metrics: VisualMetric[] }) {
  return (
    <section className="panel metric-panel">
      <h2>Metrics</h2>
      <div className="metric-list">
        {metrics.map((metric) => (
          <div key={metric.id} className="metric-row">
            <div>
              <span>{metric.name}</span>
              <strong className={scoreClass(metric)}>{metric.value}</strong>
            </div>
            <div className="metric-track">
              <div className={scoreClass(metric)} style={{ width: `${metric.value}%` }} />
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
