# Traceable Agentic Simulation Demo

Open-source prototype for turning a messy natural-language decision problem into a runnable, traceable multi-agent simulation.

The current demo uses an education-policy question:

```text
If high schools replace exams with AI-assisted project-based assessment, what happens?
```

## What It Shows

- Scenario creation from a decision question
- Harness-validated `WorldSpec`
- Evidence cards and explicit assumptions
- Compiler from world blueprint to executable state
- LLM-backed stakeholder decisions through an OpenAI-compatible API
- Machine-readable trace events
- Auditable report claims linked to evidence, assumptions, and trace events
- AI Town-style PixiJS pixel visualization

## Stack

- Convex for backend functions and database
- TypeScript + Zod for schema and harness validation
- React + Vite for frontend
- PixiJS for the simulation view
- SiliconFlow / OpenAI-compatible chat API for LLM agent decisions

## Run Backend

```bash
npm install
npm run dev:backend
```

Set LLM provider secrets in Convex env:

```bash
npx convex env set LLM_API_BASE_URL "https://api.siliconflow.cn/v1"
npx convex env set LLM_MODEL "deepseek-ai/DeepSeek-V4-Flash"
npx convex env set LLM_API_KEY "<your-key>"
```

Run checks:

```bash
npm run typecheck
npm run test:backend
npm run test:llm:agent
```

## Run Frontend

```bash
cd frontend
npm install
npm run dev
```

The frontend defaults to the local Convex URL:

```text
http://127.0.0.1:3210
```

Override it with:

```bash
VITE_CONVEX_URL="<your-convex-url>" npm run dev
```

## Credits

The pixel visual direction and copied public assets are inspired by and adapted from [a16z-infra/ai-town](https://github.com/a16z-infra/ai-town), which is MIT licensed.

This repository does not reuse AI Town's backend engine. It keeps the RP simulation pipeline as the source of truth and uses PixiJS for visualization.
