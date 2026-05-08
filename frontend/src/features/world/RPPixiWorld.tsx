import { useEffect, useMemo, useRef } from 'react';
import {
  Application,
  Assets,
  Container,
  Graphics,
  Rectangle,
  SCALE_MODES,
  Sprite,
  Text,
  Texture,
} from 'pixi.js';
import type { PipelineRunResult, VisualAgent, VisualTraceEvent, VisualZone } from '../../lib/demoSchema';

type Props = {
  result: PipelineRunResult;
  selectedAgentId?: string;
  selectedTraceId?: string;
  isPlaying: boolean;
  onSelectAgent: (agentId: string) => void;
  onMoveAgentToZone: (agentId: string, zoneId: string) => void;
};

const worldWidth = 980;
const worldHeight = 660;
const tileSize = 32;

function isHighlighted(agent: VisualAgent, trace?: VisualTraceEvent) {
  return trace?.actorId === agent.id;
}

function drawGround(container: Container) {
  const ground = new Graphics();
  ground.beginFill(0x6fa56d);
  ground.drawRect(0, 0, worldWidth, worldHeight);
  ground.endFill();

  for (let x = 0; x < worldWidth; x += tileSize) {
    for (let y = 0; y < worldHeight; y += tileSize) {
      if ((x / tileSize + y / tileSize) % 2 === 0) {
        ground.beginFill(0x78ae73, 0.28);
        ground.drawRect(x, y, tileSize, tileSize);
        ground.endFill();
      }
    }
  }

  const road = new Graphics();
  road.lineStyle(38, 0xc5a46d, 0.95);
  road.moveTo(210, 190);
  road.lineTo(475, 160);
  road.lineTo(740, 215);
  road.lineTo(750, 455);
  road.moveTo(475, 160);
  road.lineTo(300, 470);

  container.addChild(ground, road);
}

function drawZone(container: Container, zone: VisualZone, active: boolean) {
  const zoneBox = new Graphics();
  zoneBox.lineStyle(active ? 6 : 4, active ? 0xfff06a : 0x3d2c19, active ? 0.95 : 0.55);
  zoneBox.beginFill(zone.color, 0.9);
  zoneBox.drawRoundedRect(zone.x, zone.y, zone.width, zone.height, 6);
  zoneBox.endFill();
  zoneBox.beginFill(0xffffff, 0.12);
  zoneBox.drawRoundedRect(zone.x + 12, zone.y + 12, zone.width - 24, zone.height - 24, 4);
  zoneBox.endFill();

  const label = new Text(zone.name, {
    fontFamily: 'monospace',
    fontSize: 15,
    fill: 0x23160c,
    fontWeight: '700',
  });
  label.x = zone.x + 14;
  label.y = zone.y + 12;

  container.addChild(zoneBox, label);
  return zoneBox;
}

type AgentPieces = {
  agent: VisualAgent;
  container: Container;
  sprite: Sprite;
  shadow: Graphics;
  ring: Graphics;
  bubble: Graphics;
  label?: Text;
  baseX: number;
  baseY: number;
  targetX: number;
  targetY: number;
  frameRow: number;
};

function fallbackTargetZoneId(trace: VisualTraceEvent | undefined, agent: VisualAgent) {
  if (trace?.targetZoneId) return trace.targetZoneId;

  const action = trace?.actionType ?? '';
  if (agent.id === 'teacher' || action.includes('workload') || action.includes('rubric')) {
    return 'principal-office';
  }
  if (agent.id === 'admissions-officer' || action.includes('admission') || action.includes('comparability')) {
    return 'admissions-office';
  }
  if (agent.id === 'tutoring-owner' || action.includes('gaming') || action.includes('market')) {
    return 'tutoring-street';
  }
  if (agent.id === 'principal' || action.includes('policy')) {
    return 'teacher-office';
  }
  return 'principal-office';
}

function createAgentSprite(texture: Texture, agent: VisualAgent, active: boolean) {
  const frame = new Rectangle(0, agent.spriteRow * 32, 32, 32);
  const container = new Container();
  container.x = agent.x;
  container.y = agent.y;
  container.zIndex = agent.y + 80;
  container.eventMode = 'static';
  container.cursor = 'pointer';

  const sprite = new Sprite(new Texture(texture.baseTexture, frame));
  sprite.anchor.set(0.5);
  sprite.y = 0;
  sprite.scale.set(active ? 2.25 : 2);

  const shadow = new Graphics();
  shadow.beginFill(0x000000, 0.28);
  shadow.drawEllipse(0, 28, active ? 27 : 22, active ? 10 : 8);
  shadow.endFill();

  const ring = new Graphics();
  ring.lineStyle(active ? 5 : 2, active ? 0xfff06a : 0xffffff, active ? 0.95 : 0.25);
  ring.drawCircle(0, 4, active ? 35 : 29);

  const bubble = new Graphics();
  bubble.beginFill(0xfff06a, active ? 0.95 : 0);
  bubble.drawCircle(23, -29, active ? 7 : 0);
  bubble.endFill();

  const label = active
    ? new Text(agent.name, {
        fontFamily: 'monospace',
        fontSize: 13,
        fill: 0xfaf4dc,
        stroke: 0x1e160e,
        strokeThickness: 4,
      })
    : undefined;
  if (label) {
    label.anchor.set(0.5);
    label.y = -42;
  }

  container.addChild(shadow, ring, sprite, bubble);
  if (label) {
    container.addChild(label);
  }

  return {
    agent,
    container,
    sprite,
    shadow,
    ring,
    bubble,
    label,
    baseX: agent.x,
    baseY: agent.y,
    targetX: agent.x,
    targetY: agent.y,
    frameRow: agent.spriteRow,
  };
}

function drawTracePath(container: Container, agent: VisualAgent, trace?: VisualTraceEvent) {
  const path = new Graphics();
  if (!trace || trace.actorId !== agent.id) {
    return path;
  }

  path.lineStyle(5, 0xfff06a, 0.7);
  path.moveTo(agent.x, agent.y + 12);
  path.bezierCurveTo(agent.x + 45, agent.y - 72, 500, 250, 700, 335);
  path.lineStyle(2, 0xffffff, 0.4);
  path.drawCircle(agent.x, agent.y + 12, 42);
  container.addChild(path);
  return path;
}

function drawMovementPath(
  path: Graphics,
  from: { x: number; y: number },
  to: { x: number; y: number },
  color: number,
) {
  path.clear();
  path.lineStyle(6, color, 0.88);
  path.moveTo(from.x, from.y + 8);
  path.lineTo(to.x, to.y + 8);
  path.lineStyle(2, 0xffffff, 0.65);
  path.drawCircle(to.x, to.y + 8, 26);
}

export function RPPixiWorld({
  result,
  selectedAgentId,
  selectedTraceId,
  isPlaying,
  onSelectAgent,
  onMoveAgentToZone,
}: Props) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const selectedTrace = useMemo(
    () => result.traceEvents.find((trace) => trace.id === selectedTraceId),
    [result.traceEvents, selectedTraceId],
  );

  useEffect(() => {
    if (!hostRef.current) return;

    let destroyed = false;
    const app = new Application<HTMLCanvasElement>({
      width: hostRef.current.clientWidth,
      height: hostRef.current.clientHeight,
      background: '#7ab5ff',
      antialias: false,
      resolution: window.devicePixelRatio || 1,
      autoDensity: true,
    });
    app.stage.sortableChildren = true;
    hostRef.current.replaceChildren(app.view);

    const root = new Container();
    root.sortableChildren = true;
    app.stage.addChild(root);

    function fitWorld() {
      if (!hostRef.current) return;
      const width = hostRef.current.clientWidth;
      const height = hostRef.current.clientHeight;
      app.renderer.resize(width, height);
      const scale = Math.min(width / worldWidth, height / worldHeight);
      root.scale.set(scale);
      root.x = (width - worldWidth * scale) / 2;
      root.y = (height - worldHeight * scale) / 2;
    }

    const render = async () => {
      const texture = await Assets.load('/ai-town/assets/32x32folk.png');
      if (destroyed) return;
      texture.baseTexture.scaleMode = SCALE_MODES.NEAREST;

      drawGround(root);

      const agentPieces: AgentPieces[] = [];
      const tracePaths: Graphics[] = [];
      const metricPulse = new Graphics();
      const commandPath = new Graphics();
      root.addChild(commandPath);
      root.addChild(metricPulse);

      const selectedAgent = result.compiledState.agents.find((agent) => agent.id === selectedAgentId);
      result.compiledState.zones.forEach((zone) => {
        const active = selectedAgent?.zoneId === zone.id;
        const zoneBox = drawZone(root, zone, active);
        zoneBox.eventMode = 'static';
        zoneBox.cursor = selectedAgentId ? 'crosshair' : 'pointer';
        zoneBox.on('pointerdown', () => {
          if (!selectedAgentId) return;
          const pieces = agentPieces.find((candidate) => candidate.agent.id === selectedAgentId);
          if (!pieces) return;

          pieces.targetX = zone.x + zone.width / 2;
          pieces.targetY = zone.y + zone.height / 2 + 22;
          onMoveAgentToZone(selectedAgentId, zone.id);

          drawMovementPath(
            commandPath,
            { x: pieces.container.x, y: pieces.container.y },
            { x: pieces.targetX, y: pieces.targetY },
            0x72d46a,
          );
        });
      });

      for (const agent of result.compiledState.agents) {
        const active = selectedAgentId === agent.id || isHighlighted(agent, selectedTrace);
        const pieces = createAgentSprite(texture, agent, active);
        const path = drawTracePath(root, agent, selectedTrace);
        tracePaths.push(path);
        pieces.container.on('pointerdown', () => onSelectAgent(agent.id));
        root.addChild(pieces.container);
        agentPieces.push(pieces);
      }

      if (isPlaying && selectedTrace) {
        const actorPieces = agentPieces.find((candidate) => candidate.agent.id === selectedTrace.actorId);
        if (actorPieces) {
          const targetZoneId = fallbackTargetZoneId(selectedTrace, actorPieces.agent);
          const targetZone = result.compiledState.zones.find((zone) => zone.id === targetZoneId);
          if (targetZone) {
            actorPieces.targetX = targetZone.x + targetZone.width / 2;
            actorPieces.targetY = targetZone.y + targetZone.height / 2 + 22;
            drawMovementPath(
              commandPath,
              { x: actorPieces.container.x, y: actorPieces.container.y },
              { x: actorPieces.targetX, y: actorPieces.targetY },
              0xfff06a,
            );
          }
        }
      }

      let elapsed = 0;
      app.ticker.add((delta) => {
        elapsed += delta / 60;
        const slowPulse = (Math.sin(elapsed * Math.PI * 2) + 1) / 2;

        for (const pieces of agentPieces) {
          const active = selectedAgentId === pieces.agent.id || selectedTrace?.actorId === pieces.agent.id;
          const dx = pieces.targetX - pieces.container.x;
          const dy = pieces.targetY - pieces.container.y;
          const isMoving = Math.hypot(dx, dy) > 1;
          pieces.container.x += dx * 0.08;
          pieces.container.y += dy * 0.08;
          const walkOffset = active && isPlaying && !isMoving ? Math.sin(elapsed * Math.PI * 2) * 18 : 0;
          const bob = active ? Math.sin(elapsed * Math.PI * 5 + pieces.frameRow) * 5 : 0;
          const drift = active && isPlaying && !isMoving ? Math.cos(elapsed * Math.PI * 2) * 10 : 0;

          if (!isMoving) {
            pieces.container.x = pieces.targetX + walkOffset;
            pieces.container.y = pieces.targetY + drift;
          }
          pieces.sprite.y = bob;
          pieces.sprite.scale.set(active ? 2.2 + slowPulse * 0.18 : 2);

          pieces.ring.clear();
          pieces.ring.lineStyle(active ? 5 : 2, active ? 0xfff06a : 0xffffff, active ? 0.65 + slowPulse * 0.35 : 0.22);
          pieces.ring.drawCircle(0, 4, active ? 31 + slowPulse * 11 : 29);

          pieces.bubble.clear();
          if (active) {
            pieces.bubble.beginFill(0xfff06a, 0.75 + slowPulse * 0.2);
            pieces.bubble.drawCircle(23, -29 - bob, 5 + slowPulse * 4);
            pieces.bubble.endFill();
          }
        }

        metricPulse.clear();
        if (selectedTrace) {
          const intensity = 0.18 + slowPulse * 0.28;
          metricPulse.lineStyle(4, 0xff7368, intensity);
          metricPulse.drawRoundedRect(18, 18, worldWidth - 36, worldHeight - 36, 12);
        }

        tracePaths.forEach((path, index) => {
          path.alpha = 0.45 + Math.sin(elapsed * Math.PI * 2 + index) * 0.25;
        });
      });

      fitWorld();
    };

    void render();
    const resizeObserver = new ResizeObserver(fitWorld);
    resizeObserver.observe(hostRef.current);

    return () => {
      destroyed = true;
      resizeObserver.disconnect();
      app.destroy(true, { children: true, texture: false, baseTexture: false });
    };
  }, [isPlaying, onMoveAgentToZone, onSelectAgent, result, selectedAgentId, selectedTrace]);

  return <div ref={hostRef} className="pixi-host" aria-label="AI Town style simulation canvas" />;
}
