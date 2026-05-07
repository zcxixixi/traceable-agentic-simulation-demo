import { useMemo, useState } from 'react';
import { samplePipelineResult } from '../lib/samplePipeline';
import { RPPixiWorld } from '../features/world/RPPixiWorld';
import { AgentInspector } from '../features/world/AgentInspector';
import { MetricPanel } from '../features/world/MetricPanel';
import { TraceTimeline } from '../features/trace/TraceTimeline';
import { AuditableReport } from '../features/report/AuditableReport';
import { RetrievalPanel } from '../features/retrieval/RetrievalPanel';
import { PipelineTimeline } from '../features/pipeline/PipelineTimeline';

export function App() {
  const [result, setResult] = useState(samplePipelineResult);
  const [selectedAgentId, setSelectedAgentId] = useState('student');
  const [selectedTraceId, setSelectedTraceId] = useState(result.traceEvents[0]?.id);
  const [isRunning, setIsRunning] = useState(false);

  const selectedAgent = useMemo(
    () => result.compiledState.agents.find((agent) => agent.id === selectedAgentId),
    [result.compiledState.agents, selectedAgentId],
  );
  const selectedDecision = useMemo(
    () => result.agentDecisions.find((decision) => decision.agentId === selectedAgentId),
    [result.agentDecisions, selectedAgentId],
  );
  const selectedTrace = useMemo(
    () => result.traceEvents.find((trace) => trace.id === selectedTraceId),
    [result.traceEvents, selectedTraceId],
  );

  function runPipeline() {
    setIsRunning(true);
    window.setTimeout(() => {
      setResult(samplePipelineResult);
      setSelectedAgentId('student');
      setSelectedTraceId(samplePipelineResult.traceEvents[0]?.id);
      setIsRunning(false);
    }, 450);
  }

  return (
    <div className="app-shell">
      <header className="app-header">
        <div>
          <p className="eyebrow">Traceable Agentic Simulation</p>
          <h1>AI Town-style RP Pipeline</h1>
          <p className="question">{result.question}</p>
        </div>
        <button className="run-button" type="button" onClick={runPipeline}>
          {isRunning ? 'Running pipeline' : 'Run full pipeline'}
        </button>
      </header>

      <main className="dashboard">
        <section className="world-surface">
          <RPPixiWorld
            result={result}
            selectedAgentId={selectedAgentId}
            selectedTraceId={selectedTraceId}
            onSelectAgent={setSelectedAgentId}
          />
        </section>

        <aside className="right-rail">
          <AgentInspector
            agent={selectedAgent}
            decision={selectedDecision}
            trace={selectedTrace}
          />
          <MetricPanel metrics={result.compiledState.metrics} />
        </aside>

        <PipelineTimeline result={result} />
        <TraceTimeline
          traces={result.traceEvents}
          selectedTraceId={selectedTraceId}
          onSelectTrace={(traceId, actorId) => {
            setSelectedTraceId(traceId);
            setSelectedAgentId(actorId);
          }}
        />
        <RetrievalPanel results={result.retrievalResults} />
        <AuditableReport result={result} />
      </main>
    </div>
  );
}
