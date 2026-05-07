import type { AgentDecision, VisualAgent, VisualTraceEvent } from '../../lib/demoSchema';

type Props = {
  agent?: VisualAgent;
  decision?: AgentDecision;
  trace?: VisualTraceEvent;
};

export function AgentInspector({ agent, decision, trace }: Props) {
  if (!agent) {
    return (
      <section className="panel inspector-panel">
        <h2>Agent</h2>
        <p>Select a character on the map.</p>
      </section>
    );
  }

  return (
    <section className="panel inspector-panel">
      <h2>{agent.name}</h2>
      <p className="role">{agent.role}</p>
      <div className="detail-block">
        <span>Goal</span>
        <p>{agent.goal}</p>
      </div>
      <div className="detail-grid">
        <div>
          <span>Trust</span>
          <strong>{agent.state.trust}</strong>
        </div>
        <div>
          <span>Stress</span>
          <strong>{agent.state.stress}</strong>
        </div>
        <div>
          <span>Influence</span>
          <strong>{agent.state.influence}</strong>
        </div>
      </div>
      {decision && (
        <div className="detail-block">
          <span>Latest decision</span>
          <p>{decision.proposedAction.type}</p>
          <small>
            Evidence {decision.retrievedEvidenceIds.join(', ')} · Assumptions{' '}
            {decision.retrievedAssumptionIds.join(', ')}
          </small>
        </div>
      )}
      {trace && (
        <div className="detail-block">
          <span>Selected trace</span>
          <p>{trace.reason}</p>
        </div>
      )}
    </section>
  );
}
