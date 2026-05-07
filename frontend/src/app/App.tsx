import { useMemo, useState } from 'react';
import { samplePipelineResult } from '../lib/samplePipeline';
import { runEducationReformPipeline } from '../lib/convexClient';
import { RPPixiWorld } from '../features/world/RPPixiWorld';
import { AgentInspector } from '../features/world/AgentInspector';
import { MetricPanel } from '../features/world/MetricPanel';
import { TraceTimeline } from '../features/trace/TraceTimeline';
import { AuditableReport } from '../features/report/AuditableReport';
import { RetrievalPanel } from '../features/retrieval/RetrievalPanel';
import { PipelineTimeline } from '../features/pipeline/PipelineTimeline';

export function App() {
  const [result, setResult] = useState(samplePipelineResult);
  const [question, setQuestion] = useState(samplePipelineResult.question);
  const [selectedAgentId, setSelectedAgentId] = useState('student');
  const [selectedTraceId, setSelectedTraceId] = useState(result.traceEvents[0]?.id);
  const [isRunning, setIsRunning] = useState(false);
  const [runError, setRunError] = useState<string>();
  const [lastRunSource, setLastRunSource] = useState<'sample' | 'convex'>('sample');
  const [maxAgents, setMaxAgents] = useState(3);

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

  async function runPipeline() {
    setIsRunning(true);
    setRunError(undefined);

    try {
      const pipelineResult = await runEducationReformPipeline(question, maxAgents);
      setResult(pipelineResult);
      const firstAgentId = pipelineResult.compiledState.agents[0]?.id ?? 'student';
      const firstTraceId = pipelineResult.traceEvents[0]?.id;
      setSelectedAgentId(firstAgentId);
      setSelectedTraceId(firstTraceId);
      setLastRunSource('convex');
    } catch (error) {
      setRunError(error instanceof Error ? error.message : String(error));
    } finally {
      setIsRunning(false);
    }
  }

  return (
    <div className="app-shell">
      <header className="app-header">
        <div>
          <p className="eyebrow">Traceable Agentic Simulation</p>
          <h1>AI Town-style RP Pipeline</h1>
          <textarea
            className="question-input"
            value={question}
            onChange={(event) => setQuestion(event.target.value)}
            aria-label="Decision question"
          />
          <p className="run-status">
            {lastRunSource === 'convex'
              ? 'Live Convex pipeline result'
              : 'Sample pipeline loaded. Run the full pipeline to call Convex + LLM agents.'}
          </p>
        </div>
        <div className="run-controls">
          <div className="agent-toggle" aria-label="Agent count">
            <button
              type="button"
              className={maxAgents === 3 ? 'toggle-active' : ''}
              onClick={() => setMaxAgents(3)}
              disabled={isRunning}
            >
              Fast 3
            </button>
            <button
              type="button"
              className={maxAgents === 6 ? 'toggle-active' : ''}
              onClick={() => setMaxAgents(6)}
              disabled={isRunning}
            >
              Full 6
            </button>
          </div>
          <button className="run-button" type="button" onClick={runPipeline} disabled={isRunning}>
            {isRunning ? `Running ${maxAgents} agents` : 'Run pipeline'}
          </button>
        </div>
      </header>

      {runError && (
        <div className="error-banner">
          <strong>Pipeline failed</strong>
          <span>{runError}</span>
        </div>
      )}

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
