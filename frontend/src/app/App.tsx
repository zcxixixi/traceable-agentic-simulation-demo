import { useCallback, useEffect, useMemo, useState } from 'react';
import { samplePipelineResult } from '../lib/samplePipeline';
import { runEducationReformPipeline } from '../lib/convexClient';
import { RPPixiWorld } from '../features/world/RPPixiWorld';
import { AgentInspector } from '../features/world/AgentInspector';
import { MetricPanel } from '../features/world/MetricPanel';
import { TraceTimeline } from '../features/trace/TraceTimeline';
import { AuditableReport } from '../features/report/AuditableReport';
import { RetrievalPanel } from '../features/retrieval/RetrievalPanel';
import { PipelineTimeline } from '../features/pipeline/PipelineTimeline';

const moduleSummary = [
  'World',
  'Evidence',
  'Agents',
  'Trace',
  'Report',
];
const demoStepMs = 3800;

export function App() {
  const [result, setResult] = useState(samplePipelineResult);
  const [question, setQuestion] = useState(samplePipelineResult.question);
  const [selectedAgentId, setSelectedAgentId] = useState('student');
  const [selectedTraceId, setSelectedTraceId] = useState(result.traceEvents[0]?.id);
  const [isRunning, setIsRunning] = useState(false);
  const [runError, setRunError] = useState<string>();
  const [lastRunSource, setLastRunSource] = useState<'sample' | 'convex'>('sample');
  const [maxAgents, setMaxAgents] = useState(3);
  const [isPlaying, setIsPlaying] = useState(true);
  const [visualCommands, setVisualCommands] = useState<string[]>([]);
  const [motionKey, setMotionKey] = useState(0);

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
  const selectedTraceIndex = useMemo(
    () => Math.max(0, result.traceEvents.findIndex((trace) => trace.id === selectedTraceId)),
    [result.traceEvents, selectedTraceId],
  );
  const selectedTraceAgent = useMemo(
    () => result.compiledState.agents.find((agent) => agent.id === selectedTrace?.actorId),
    [result.compiledState.agents, selectedTrace?.actorId],
  );
  const selectedTraceZone = useMemo(
    () => result.compiledState.zones.find((zone) => zone.id === selectedTrace?.targetZoneId),
    [result.compiledState.zones, selectedTrace?.targetZoneId],
  );

  useEffect(() => {
    if (!isPlaying || isRunning || result.traceEvents.length === 0) return undefined;

    const interval = window.setInterval(() => {
      setSelectedTraceId((currentTraceId) => {
        const currentIndex = result.traceEvents.findIndex((trace) => trace.id === currentTraceId);
        const nextTrace = result.traceEvents[(currentIndex + 1) % result.traceEvents.length];
        if (nextTrace) {
          setSelectedAgentId(nextTrace.actorId);
          return nextTrace.id;
        }
        return currentTraceId;
      });
    }, demoStepMs);

    return () => window.clearInterval(interval);
  }, [isPlaying, isRunning, result.traceEvents]);

  function selectAgent(agentId: string) {
    setSelectedAgentId(agentId);
    const trace = result.traceEvents.find((candidate) => candidate.actorId === agentId);
    if (trace) {
      setSelectedTraceId(trace.id);
      setMotionKey((value) => value + 1);
    }
  }

  function startDemo() {
    const firstTrace = samplePipelineResult.traceEvents[0];
    setResult(samplePipelineResult);
    setQuestion(samplePipelineResult.question);
    setRunError(undefined);
    setIsRunning(false);
    setIsPlaying(true);
    setLastRunSource('sample');
    setSelectedAgentId(firstTrace?.actorId ?? samplePipelineResult.compiledState.agents[0]?.id ?? 'student');
    setSelectedTraceId(firstTrace?.id);
    setVisualCommands(['Demo reset: agents will replay their decisions']);
    setMotionKey((value) => value + 1);
  }

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
      setIsPlaying(true);
      setMotionKey((value) => value + 1);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setRunError(`${message}. Demo stayed on the local scripted run.`);
      setLastRunSource('sample');
    } finally {
      setIsRunning(false);
    }
  }

  const moveSelectedAgent = useCallback((agentId: string, zoneId: string) => {
    const agent = result.compiledState.agents.find((candidate) => candidate.id === agentId);
    const zone = result.compiledState.zones.find((candidate) => candidate.id === zoneId);
    if (!agent || !zone) return;

    setSelectedAgentId(agentId);
    setVisualCommands((commands) => [
      `${agent.name} moved to ${zone.name}`,
      ...commands.slice(0, 3),
    ]);
  }, [result.compiledState.agents, result.compiledState.zones]);

  return (
    <div className="app-shell">
      <header className="app-header">
        <div className="title-block">
          <p className="eyebrow">Traceable Agentic Simulation</p>
          <h1>Policy Town Simulator</h1>
          <p className="hero-line">A playable AI town for testing real-world decisions.</p>
          <textarea
            className="question-input"
            value={question}
            onChange={(event) => setQuestion(event.target.value)}
            aria-label="Decision question"
          />
          <p className="run-status">
            {lastRunSource === 'convex'
              ? 'Live Convex + LLM run'
              : 'Local scripted demo ready. Use Live backend only when Convex is running.'}
          </p>
        </div>
        <div className="run-controls">
          <button
            className={`play-toggle ${isPlaying ? 'play-active' : ''}`}
            type="button"
            onClick={() => setIsPlaying((value) => !value)}
          >
            {isPlaying ? 'Autonomous' : 'Paused'}
          </button>
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
          <button className="run-button" type="button" onClick={startDemo} disabled={isRunning}>
            Start demo
          </button>
          <button className="live-button" type="button" onClick={runPipeline} disabled={isRunning}>
            {isRunning ? `Running ${maxAgents}` : 'Live backend'}
          </button>
        </div>
      </header>

      {runError && (
        <div className="error-banner">
          <strong>Pipeline failed</strong>
          <span>{runError}</span>
        </div>
      )}

      <main className="simulator-layout">
        <section className="playfield-card">
          <div className="hud-strip">
            {moduleSummary.map((module) => (
              <span key={module}>{module}</span>
            ))}
          </div>
          <section className="world-surface">
            <RPPixiWorld
              result={result}
              selectedAgentId={selectedAgentId}
              selectedTraceId={selectedTraceId}
              isPlaying={isPlaying && !isRunning}
              motionKey={motionKey}
              onSelectAgent={selectAgent}
              onMoveAgentToZone={moveSelectedAgent}
            />
            <div className="world-hint">
              <strong>Play</strong>
              <span>
                {isPlaying
                  ? 'Agents are acting from their own trace decisions.'
                  : 'Click a character, then click a building.'}
              </span>
              {visualCommands.map((command) => (
                <small key={command}>{command}</small>
              ))}
            </div>
          </section>
          <div className="story-bar">
            <span>Step {result.traceEvents.length > 0 ? selectedTraceIndex + 1 : 0}/{result.traceEvents.length}</span>
            <strong>{selectedTrace?.actionType ?? 'Waiting for agent action'}</strong>
            <p>
              {selectedTrace
                ? `${selectedTraceAgent?.name ?? selectedTrace.actorId} decided to ${selectedTrace.actionType}${
                    selectedTraceZone ? ` at ${selectedTraceZone.name}` : ''
                  }. ${selectedTrace.reason}`
                : 'Select a character or run the pipeline to generate a live event.'}
            </p>
          </div>
        </section>

        <aside className="right-rail">
          <AgentInspector
            agent={selectedAgent}
            decision={selectedDecision}
            trace={selectedTrace}
          />
          <MetricPanel metrics={result.compiledState.metrics} />
        </aside>

        <section className="bottom-dock">
          <TraceTimeline
            traces={result.traceEvents}
            selectedTraceId={selectedTraceId}
            onSelectTrace={(traceId, actorId) => {
              setSelectedTraceId(traceId);
              setSelectedAgentId(actorId);
              setMotionKey((value) => value + 1);
            }}
          />
          <AuditableReport result={result} />
        </section>

        <section className="system-drawer">
          <PipelineTimeline result={result} />
          <RetrievalPanel results={result.retrievalResults} />
        </section>
      </main>
    </div>
  );
}
