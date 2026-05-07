/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as agents from "../agents.js";
import type * as assumptions from "../assumptions.js";
import type * as compiler from "../compiler.js";
import type * as evidence from "../evidence.js";
import type * as llmAgents from "../llmAgents.js";
import type * as pipeline from "../pipeline.js";
import type * as reports from "../reports.js";
import type * as runtime from "../runtime.js";
import type * as scenarios from "../scenarios.js";
import type * as seed from "../seed.js";
import type * as tests from "../tests.js";
import type * as traces from "../traces.js";
import type * as worldSpecs from "../worldSpecs.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  agents: typeof agents;
  assumptions: typeof assumptions;
  compiler: typeof compiler;
  evidence: typeof evidence;
  llmAgents: typeof llmAgents;
  pipeline: typeof pipeline;
  reports: typeof reports;
  runtime: typeof runtime;
  scenarios: typeof scenarios;
  seed: typeof seed;
  tests: typeof tests;
  traces: typeof traces;
  worldSpecs: typeof worldSpecs;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {};
