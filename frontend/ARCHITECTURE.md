# Frontend Architecture

This frontend is organized to mirror the demo pipeline:

- `src/app` — application composition and top-level wiring
- `src/components/layout` — shell, header, and page scaffolding
- `src/features/scenario` — question input, stakeholder setup, and intervention selection
- `src/features/world` — pixel-style world canvas and future agent rendering
- `src/features/trace` — evidence, assumptions, and replayable event stream
- `src/features/report` — final scenario comparison and recommendation output
- `src/lib` — shared demo schema and state types
- `src/styles` — global theme and layout styles

## How it maps to the future simulation engine

The UI is intentionally separated from domain logic so that the demo can later
replace placeholder panels with live Convex queries, world-state mutations, and
agent event playback.

Planned flow:

1. `ScenarioComposer` captures the decision question and scenario inputs.
2. `WorldCanvas` renders the active simulation state.
3. `TracePanel` shows evidence links and step-by-step actions.
4. `ReportPanel` summarizes outputs and uncertainty-aware recommendations.

This structure should stay stable even after the demo is connected to real agent
and world logic.
