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
  onSelectAgent: (agentId: string) => void;
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

function drawZone(container: Container, zone: VisualZone) {
  const zoneBox = new Graphics();
  zoneBox.lineStyle(4, 0x3d2c19, 0.55);
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
}

function createAgentSprite(texture: Texture, agent: VisualAgent, active: boolean) {
  const frame = new Rectangle(0, agent.spriteRow * 32, 32, 32);
  const sprite = new Sprite(new Texture(texture.baseTexture, frame));
  sprite.anchor.set(0.5);
  sprite.x = agent.x;
  sprite.y = agent.y;
  sprite.scale.set(active ? 2.25 : 2);
  sprite.eventMode = 'static';
  sprite.cursor = 'pointer';

  const shadow = new Graphics();
  shadow.beginFill(0x000000, 0.28);
  shadow.drawEllipse(agent.x, agent.y + 28, active ? 27 : 22, active ? 10 : 8);
  shadow.endFill();

  const ring = new Graphics();
  ring.lineStyle(active ? 5 : 2, active ? 0xfff06a : 0xffffff, active ? 0.95 : 0.25);
  ring.drawCircle(agent.x, agent.y + 4, active ? 35 : 29);

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
    label.x = agent.x;
    label.y = agent.y - 42;
  }

  return { sprite, shadow, ring, label };
}

export function RPPixiWorld({
  result,
  selectedAgentId,
  selectedTraceId,
  onSelectAgent,
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
      result.compiledState.zones.forEach((zone) => drawZone(root, zone));

      for (const agent of result.compiledState.agents) {
        const active = selectedAgentId === agent.id || isHighlighted(agent, selectedTrace);
        const pieces = createAgentSprite(texture, agent, active);
        pieces.sprite.on('pointerdown', () => onSelectAgent(agent.id));
        root.addChild(pieces.shadow, pieces.ring, pieces.sprite);
        if (pieces.label) {
          root.addChild(pieces.label);
        }
      }

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
  }, [onSelectAgent, result, selectedAgentId, selectedTrace]);

  return <div ref={hostRef} className="pixi-host" aria-label="AI Town style simulation canvas" />;
}
