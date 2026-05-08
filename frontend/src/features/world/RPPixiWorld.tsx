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

type Point = { x: number; y: number };

const roadStops: Record<string, Point> = {
  classroom: { x: 285, y: 205 },
  'teacher-office': { x: 475, y: 160 },
  'principal-office': { x: 740, y: 215 },
  'admissions-office': { x: 750, y: 455 },
  'tutoring-street': { x: 300, y: 470 },
};

const roadGraph: Record<string, string[]> = {
  classroom: ['teacher-office'],
  'teacher-office': ['classroom', 'principal-office', 'tutoring-street'],
  'principal-office': ['teacher-office', 'admissions-office'],
  'admissions-office': ['principal-office'],
  'tutoring-street': ['teacher-office'],
};

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
  routePoints: Point[];
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

  const label = new Text(agent.name, {
    fontFamily: 'monospace',
    fontSize: 13,
    fill: 0xfaf4dc,
    stroke: 0x1e160e,
    strokeThickness: 4,
  });
  label.anchor.set(0.5);
  label.y = -42;
  label.alpha = active ? 1 : 0;

  container.addChild(shadow, ring, sprite, bubble);
  container.addChild(label);

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
    routePoints: [],
    frameRow: agent.spriteRow,
  };
}

function zoneTarget(zone: VisualZone) {
  return {
    x: zone.x + zone.width / 2,
    y: zone.y + zone.height / 2 + 22,
  };
}

function nearestRoadStopId(point: Point) {
  return Object.entries(roadStops).reduce((best, [id, stop]) => {
    const bestStop = roadStops[best];
    const bestDistance = Math.hypot(bestStop.x - point.x, bestStop.y - point.y);
    const stopDistance = Math.hypot(stop.x - point.x, stop.y - point.y);
    return stopDistance < bestDistance ? id : best;
  }, Object.keys(roadStops)[0]);
}

function findRoadPath(startId: string, targetId: string) {
  const queue: string[][] = [[startId]];
  const visited = new Set([startId]);

  while (queue.length > 0) {
    const path = queue.shift()!;
    const current = path[path.length - 1];
    if (current === targetId) return path;

    for (const next of roadGraph[current] ?? []) {
      if (visited.has(next)) continue;
      visited.add(next);
      queue.push([...path, next]);
    }
  }

  return [startId, targetId];
}

function dedupeRoute(points: Point[]) {
  return points.filter((point, index, route) => {
    const previous = route[index - 1];
    return !previous || Math.hypot(previous.x - point.x, previous.y - point.y) > 6;
  });
}

function buildRoadRoute(from: Point, targetZone: VisualZone) {
  const target = zoneTarget(targetZone);
  const startStopId = nearestRoadStopId(from);
  const targetStopId = roadStops[targetZone.id] ? targetZone.id : startStopId;
  const routeStops = findRoadPath(startStopId, targetStopId).map((id) => roadStops[id]);
  const route = [from, ...routeStops, target];

  return dedupeRoute(route);
}

function setAgentRoute(pieces: AgentPieces, targetZone: VisualZone) {
  const route = buildRoadRoute({ x: pieces.container.x, y: pieces.container.y }, targetZone);
  pieces.routePoints = route.slice(1);
  const finalPoint = route[route.length - 1];
  pieces.targetX = finalPoint.x;
  pieces.targetY = finalPoint.y;
  return route;
}

function drawMovementPath(path: Graphics, route: Point[], color: number) {
  path.clear();
  const drawRoute = () => {
    route.forEach((point, index) => {
      if (index === 0) {
        path.moveTo(point.x, point.y + 8);
        return;
      }
      path.lineTo(point.x, point.y + 8);
    });
  };
  path.lineStyle(11, 0x1b1308, 0.42);
  drawRoute();
  path.lineStyle(5, color, 0.92);
  drawRoute();
  const to = route[route.length - 1];
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
  const selectedAgentIdRef = useRef(selectedAgentId);
  const selectedTraceRef = useRef(selectedTrace);
  const isPlayingRef = useRef(isPlaying);
  const onSelectAgentRef = useRef(onSelectAgent);
  const onMoveAgentToZoneRef = useRef(onMoveAgentToZone);

  useEffect(() => {
    selectedAgentIdRef.current = selectedAgentId;
    selectedTraceRef.current = selectedTrace;
    isPlayingRef.current = isPlaying;
    onSelectAgentRef.current = onSelectAgent;
    onMoveAgentToZoneRef.current = onMoveAgentToZone;
  }, [isPlaying, onMoveAgentToZone, onSelectAgent, selectedAgentId, selectedTrace]);

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
      const agentPiecesById = new Map<string, AgentPieces>();
      const commandPath = new Graphics();

      result.compiledState.zones.forEach((zone) => {
        const zoneBox = drawZone(root, zone, false);
        zoneBox.eventMode = 'static';
        zoneBox.cursor = 'crosshair';
        zoneBox.on('pointerdown', () => {
          const currentAgentId = selectedAgentIdRef.current;
          if (!currentAgentId) return;
          const pieces = agentPiecesById.get(currentAgentId);
          if (!pieces) return;

          const route = setAgentRoute(pieces, zone);
          onMoveAgentToZoneRef.current(currentAgentId, zone.id);
          drawMovementPath(commandPath, route, 0x72d46a);
        });
      });

      root.addChild(commandPath);

      for (const agent of result.compiledState.agents) {
        const active = selectedAgentIdRef.current === agent.id || selectedTraceRef.current?.actorId === agent.id;
        const pieces = createAgentSprite(texture, agent, active);
        pieces.container.on('pointerdown', () => onSelectAgentRef.current(agent.id));
        root.addChild(pieces.container);
        agentPieces.push(pieces);
        agentPiecesById.set(agent.id, pieces);
      }

      let lastAutonomousTraceId: string | undefined;
      let elapsed = 0;
      app.ticker.add((delta) => {
        elapsed += delta / 60;
        const slowPulse = (Math.sin(elapsed * Math.PI * 2) + 1) / 2;
        const currentTrace = selectedTraceRef.current;
        const currentSelectedAgentId = selectedAgentIdRef.current;
        const shouldPlay = isPlayingRef.current;

        if (!shouldPlay) {
          lastAutonomousTraceId = undefined;
        }

        if (shouldPlay && currentTrace && currentTrace.id !== lastAutonomousTraceId) {
          lastAutonomousTraceId = currentTrace.id;
          const actorPieces = agentPiecesById.get(currentTrace.actorId);
          if (actorPieces) {
            const targetZoneId = fallbackTargetZoneId(currentTrace, actorPieces.agent);
            const targetZone = result.compiledState.zones.find((zone) => zone.id === targetZoneId);
            if (targetZone) {
              const route = setAgentRoute(actorPieces, targetZone);
              drawMovementPath(commandPath, route, 0xfff06a);
            }
          }
        }

        for (const pieces of agentPieces) {
          const active = currentSelectedAgentId === pieces.agent.id || currentTrace?.actorId === pieces.agent.id;
          const nextPoint = pieces.routePoints[0] ?? { x: pieces.targetX, y: pieces.targetY };
          const dx = nextPoint.x - pieces.container.x;
          const dy = nextPoint.y - pieces.container.y;
          const distance = Math.hypot(dx, dy);
          const isMoving = pieces.routePoints.length > 0 && distance > 1;

          if (isMoving) {
            const step = Math.min(distance, 3.4 * delta);
            pieces.container.x += (dx / distance) * step;
            pieces.container.y += (dy / distance) * step;
          }

          if (pieces.routePoints.length > 0 && distance <= 4) {
            pieces.container.x = nextPoint.x;
            pieces.container.y = nextPoint.y;
            pieces.routePoints.shift();
          }

          const bob = active && shouldPlay ? Math.sin(elapsed * Math.PI * 4 + pieces.frameRow) * 2 : 0;

          if (pieces.routePoints.length === 0 && !isMoving) {
            pieces.container.x = pieces.targetX;
            pieces.container.y = pieces.targetY;
          }
          pieces.sprite.y = bob;
          pieces.sprite.scale.set(active ? 2.12 : 2);
          pieces.label!.alpha = active ? 1 : 0;

          pieces.ring.clear();
          pieces.ring.lineStyle(active ? 4 : 2, active ? 0xfff06a : 0xffffff, active ? 0.82 : 0.18);
          pieces.ring.drawCircle(0, 4, active ? 34 : 29);

          pieces.bubble.clear();
          if (active) {
            pieces.bubble.beginFill(0xfff06a, 0.75 + slowPulse * 0.2);
            pieces.bubble.drawCircle(23, -29 - bob, 5 + slowPulse * 4);
            pieces.bubble.endFill();
          }
        }
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
  }, [result]);

  return <div ref={hostRef} className="pixi-host" aria-label="AI Town style simulation canvas" />;
}
