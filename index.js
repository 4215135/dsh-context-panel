/**
 * Host half of dsh-context-panel.
 *
 * The panel itself is a pure consumer of official session projections, which the
 * client half reads through the slot kit's `useProjection` — no RPC, no network.
 * Two things cannot come from a projection, and both are served here:
 *
 * 1. **What a token costs.** No shipped projection key carries the model in use, so
 *    this half observes `provider`/`model` on the `system-prompt/assemble`
 *    waterfall and prices the buckets with the matching rate. A row `config` may
 *    override which model is priced.
 * 2. **What the MCP tools cost.** No projection exposes the model-visible tool
 *    list, so this half observes that same assembly read-only.
 *
 * The single route is read-only and loopback-only:
 *
 *   GET /api/dsh-context-panel/state
 *     → { ok, pricing: {...}, mcp: {...} | null }
 *
 * It returns only the tariff rules from this row's own `config` (or the built-in
 * defaults) and a size summary of the last assembled tool list. It never reads the
 * session store, never touches credentials, never accepts a request body, and
 * refuses any caller that is not loopback.
 *
 * Tariff model mirrors the DeepSeek price book: peak hours are Beijing 09:00-12:00
 * and 14:00-18:00, every other Beijing hour is off-peak, and Beijing weekends are
 * always off-peak.
 */

/** Stable Cordis plugin name. */
export const name = "dsh-context-panel";

/** Services required before this plugin activates. */
export const inject = ["webServer"];

/** The single route this plugin owns. */
export const STATE_PATH = "/api/dsh-context-panel/state";

const LOOPBACK_ADDRESSES = new Set(["127.0.0.1", "::1", "::ffff:127.0.0.1"]);
const LOOPBACK_HOSTNAMES = new Set(["localhost", "127.0.0.1", "[::1]"]);
const BEIJING_OFFSET_MS = 8 * 60 * 60 * 1000;
const MINUTES_PER_DAY = 24 * 60;

/** Default currency for the built-in table. */
export const DEFAULT_CURRENCY = "CNY";
/** Default Beijing peak windows. */
export const DEFAULT_PEAK_WINDOWS = ["09:00-12:00", "14:00-18:00"];
/**
 * Compaction trigger assumed when the row does not state one.
 * `@deepseek-ai/dsh-compaction-basic` uses 0.8 of the routed window by default; a
 * per-model `modelPolicies` override cannot be read from a plugin, so a deployment
 * that changes it states the same number here and the panel's marker follows.
 */
export const DEFAULT_COMPACT_RATIO = 0.8;

/**
 * Built-in rates in `currency` per million tokens, taken from the defaults that
 * `dsh-token-usage-stats` publishes for the same tariff model (itself derived from
 * the DeepSeek price book; `cacheWrite` is not part of that book and stays 0).
 * Prices change: treat these as a starting point and override them in this row's
 * `config` with the rates on your own contract.
 */
export const DEFAULT_PRICING = {
  "deepseek-flash": {
    peak: { input: 2, cacheRead: 0.04, cacheWrite: 0, output: 8 },
    offpeak: { input: 1, cacheRead: 0.02, cacheWrite: 0, output: 4 },
  },
  "deepseek-v4-pro": {
    peak: { input: 9, cacheRead: 0.3, cacheWrite: 0, output: 27 },
    offpeak: { input: 4.5, cacheRead: 0.15, cacheWrite: 0, output: 13.5 },
  },
};

/** Write a JSON response. */
function json(res, status, value) {
  res.writeHead(status, { "content-type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(value));
}

function isLoopbackAddress(address) {
  return typeof address === "string" && LOOPBACK_ADDRESSES.has(address);
}

function isLoopbackHostHeader(req) {
  const host = req?.headers?.host;
  if (typeof host !== "string") return false;
  return LOOPBACK_HOSTNAMES.has(host.replace(/:\d+$/, "").toLowerCase());
}

/**
 * Refuse non-GET methods and non-loopback callers before any work. Exact routes
 * bypass the connection plugin's RPC trust fence, so the handler applies its own.
 * @returns true when the request was rejected (a response has been written).
 */
function rejectForeignCaller(req, res) {
  if (req.method !== "GET") {
    json(res, 405, { ok: false, error: "method-not-allowed" });
    return true;
  }
  if (isLoopbackAddress(req.socket?.remoteAddress) && isLoopbackHostHeader(req)) return false;
  json(res, 403, { ok: false, error: "forbidden" });
  return true;
}

/**
 * Parse one `"HH:MM-HH:MM"` window into minutes since Beijing midnight.
 * @returns {{start: number, end: number} | undefined} undefined when malformed.
 */
export function parseWindow(text) {
  if (typeof text !== "string") return undefined;
  const match = /^(\d{1,2}):(\d{2})\s*-\s*(\d{1,2}):(\d{2})$/.exec(text.trim());
  if (match === null) return undefined;
  const [, fromHour, fromMinute, toHour, toMinute] = match;
  const start = Number(fromHour) * 60 + Number(fromMinute);
  const end = Number(toHour) * 60 + Number(toMinute);
  if (start < 0 || end > MINUTES_PER_DAY || start >= end) return undefined;
  return { start, end };
}

/**
 * Beijing weekday and minute-of-day for an instant.
 * @param now - epoch milliseconds.
 */
export function beijingClock(now) {
  const shifted = new Date(now + BEIJING_OFFSET_MS);
  return {
    weekday: shifted.getUTCDay(),
    minutes: shifted.getUTCHours() * 60 + shifted.getUTCMinutes(),
  };
}

/**
 * Which tariff applies at `now`. Beijing weekends are always off-peak.
 * @param now - epoch milliseconds.
 * @param windows - parsed peak windows; an empty list means always off-peak.
 */
export function tariffAt(now, windows) {
  const { weekday, minutes } = beijingClock(now);
  if (weekday === 0 || weekday === 6) return "offpeak";
  return windows.some((window) => minutes >= window.start && minutes < window.end) ? "peak" : "offpeak";
}

/** Keep the four rate keys numeric with 0 for anything unusable. */
function normalizeRates(value) {
  const number = (candidate) => (typeof candidate === "number" && Number.isFinite(candidate) && candidate >= 0 ? candidate : 0);
  const fields = value ?? {};
  return {
    input: number(fields.input ?? fields.uncachedInputPerMillion),
    cacheRead: number(fields.cacheRead ?? fields.cacheReadPerMillion),
    cacheWrite: number(fields.cacheWrite ?? fields.cacheWritePerMillion),
    output: number(fields.output ?? fields.outputPerMillion),
  };
}

/** Resolve a model entry into a flat rate set or a peak/off-peak pair. */
function normalizeModel(value) {
  if (value === null || typeof value !== "object") return undefined;
  const hasWindows = value.peak !== undefined || value.offpeak !== undefined;
  if (!hasWindows) {
    const flat = normalizeRates(value);
    return { flat, peak: flat, offpeak: flat };
  }
  const peak = normalizeRates(value.peak ?? value.offpeak);
  const offpeak = normalizeRates(value.offpeak ?? value.peak);
  return { flat: undefined, peak, offpeak };
}

/**
 * Read this row's config into a validated settings object. Every field is
 * optional: an absent or malformed config falls back to the built-in defaults
 * rather than failing activation. `model` is an *override* — when it is absent the
 * observed model from the assemble waterfall decides which rate applies.
 */
export function normalizeConfig(config) {
  const source = config !== null && typeof config === "object" ? config : {};
  const currency = typeof source.currency === "string" && source.currency.trim() !== "" ? source.currency.trim() : DEFAULT_CURRENCY;
  const model = typeof source.model === "string" && source.model.trim() !== "" ? source.model.trim() : undefined;
  const windowTexts = Array.isArray(source.peakWindows) ? source.peakWindows : DEFAULT_PEAK_WINDOWS;
  const compactRatio =
    typeof source.compactRatio === "number" && Number.isFinite(source.compactRatio) && source.compactRatio > 0 && source.compactRatio <= 1
      ? source.compactRatio
      : DEFAULT_COMPACT_RATIO;
  const windows = windowTexts.map(parseWindow).filter((entry) => entry !== undefined);
  const provided = source.pricing !== null && typeof source.pricing === "object" ? source.pricing : undefined;
  // A configured table is merged over the built-in one, so pricing a single extra
  // model does not silently drop the models the defaults already cover. Each entry
  // remembers which table it came from, so the panel can label the rate source.
  const table = {};
  for (const [key, value] of Object.entries(DEFAULT_PRICING)) {
    const entry = normalizeModel(value);
    if (entry !== undefined) table[key] = { ...entry, from: "builtin" };
  }
  for (const [key, value] of Object.entries(provided ?? {})) {
    const entry = normalizeModel(value);
    if (entry !== undefined) table[key] = { ...entry, from: "config" };
  }
  return { currency, model, windows, table, compactRatio, configuredPricing: provided !== undefined };
}

/**
 * The payload the client half consumes: the rates that apply right now, plus
 * enough context for the panel to label the number honestly.
 *
 * Which rate applies is decided by, in order: the row's configured `model`
 * override, then `<provider>/<model>` as observed on the assemble waterfall, then
 * the bare `<model>`. Nothing observed and nothing configured means the panel says
 * "not estimable" instead of guessing a model.
 *
 * @param settings - from {@link normalizeConfig}.
 * @param now - epoch milliseconds.
 * @param observed - `{ provider, model }` seen on the last assembled request, if any.
 */
export function resolvePricing(settings, now, observed) {
  const tariff = tariffAt(now, settings.windows);
  const candidates = [];
  if (settings.model !== undefined) candidates.push(settings.model);
  const observedModel = typeof observed?.model === "string" && observed.model !== "" ? observed.model : undefined;
  if (observedModel !== undefined) {
    if (typeof observed?.provider === "string" && observed.provider !== "") {
      candidates.push(`${observed.provider}/${observedModel}`);
    }
    candidates.push(observedModel);
  }
  const key = candidates.find((candidate) => Object.hasOwn(settings.table, candidate));
  if (key === undefined) {
    return {
      priced: false,
      currency: settings.currency,
      model: candidates[0],
      tariff,
      reason: observedModel === undefined && settings.model === undefined ? "no-model-observed" : "model-not-priced",
    };
  }
  const entry = settings.table[key];
  return {
    priced: true,
    currency: settings.currency,
    model: key,
    tariff,
    rates: tariff === "peak" ? entry.peak : entry.offpeak,
    source: entry.from,
  };
}

/**
 * Byte weight of one assembled tool, memoized on the tool object. The schema is
 * the bulk of what a tool costs in context, and this runs on the assemble path, so
 * the WeakMap keeps the JSON cost to once per tool generation.
 */
export function toolWeight(tool, cache) {
  if (tool === null || typeof tool !== "object") return 0;
  const cached = cache?.get(tool);
  if (typeof cached === "number") return cached;
  let bytes = typeof tool.name === "string" ? tool.name.length : 0;
  if (typeof tool.description === "string") bytes += tool.description.length;
  const schema = tool.parameters ?? tool.inputSchema;
  if (schema !== undefined) {
    try {
      bytes += JSON.stringify(schema).length;
    } catch {
      // An unserializable schema counts as its name and description only.
    }
  }
  cache?.set(tool, bytes);
  return bytes;
}

/**
 * Split an assembled tool list into totals and the MCP contribution of each
 * server, grouped by the `mcp__<server>__<tool>` public name.
 * @param assembly - the `system-prompt/assemble` payload.
 * @param cache - optional WeakMap for {@link toolWeight}.
 */
export function summarizeAssembly(assembly, cache) {
  const tools = Array.isArray(assembly?.tools) ? assembly.tools : [];
  const servers = new Map();
  let totalBytes = 0;
  let mcpTools = 0;
  let mcpBytes = 0;
  for (const tool of tools) {
    const bytes = toolWeight(tool, cache);
    totalBytes += bytes;
    const name = typeof tool?.name === "string" ? tool.name : "";
    if (!name.startsWith("mcp__")) continue;
    const server = name.slice(5).split("__")[0] || "unknown";
    mcpTools += 1;
    mcpBytes += bytes;
    const entry = servers.get(server) ?? { server, tools: 0, bytes: 0 };
    entry.tools += 1;
    entry.bytes += bytes;
    servers.set(server, entry);
  }
  return {
    totalTools: tools.length,
    totalBytes,
    mcpTools,
    mcpBytes,
    servers: [...servers.values()].sort((left, right) => right.bytes - left.bytes),
  };
}

const weightCache = new WeakMap();
let mcpSnapshot = null;
let lastModel = null;

/**
 * The provider/model an assembled request carries, read from `variables` (where
 * the model-selection plugin writes them), or undefined when the assembly names no
 * model.
 */
export function modelFromAssembly(assembly) {
  const provider = typeof assembly?.variables?.provider === "string" ? assembly.variables.provider : undefined;
  const model = typeof assembly?.variables?.model === "string" ? assembly.variables.model : undefined;
  return model === undefined ? undefined : { provider, model };
}

/** Update the last observed tool-list summary and model. Never throws into the waterfall. */
function observeAssembly(assembly) {
  try {
    const summary = summarizeAssembly(assembly, weightCache);
    mcpSnapshot = {
      observedAt: Date.now(),
      observations: (mcpSnapshot?.observations ?? 0) + 1,
      ...summary,
    };
    // The model-selection plugin writes `provider`/`model` into `assembly.variables`
    // before returning, which is why this observation runs after `next()`.
    const observed = modelFromAssembly(assembly);
    if (observed !== undefined) lastModel = { ...observed, observedAt: mcpSnapshot.observedAt };
  } catch {
    // Observation must never disturb a model request.
  }
}

/**
 * The last observed tool-list summary, or null before the first assembled request.
 * The reading is of the *assembled* list — the tools the model is charged for — not
 * of MCP protocol `tools/list` traffic, which this plugin never intercepts.
 */
export function currentMcpSnapshot() {
  return mcpSnapshot;
}

/** The provider/model seen on the last assembled request, or null before the first. */
export function currentModel() {
  return lastModel;
}

/**
 * Host plugin body: register the loopback-fenced state endpoint and the read-only
 * assemble observer. The body is wrapped so that no environment surprise can throw
 * out of activation — the client half must keep working even when this route
 * cannot be mounted.
 * @param ctx - host root context.
 * @param config - this row's optional config.
 */
export function apply(ctx, config) {
  let settings;
  try {
    settings = normalizeConfig(config);
  } catch {
    settings = normalizeConfig(undefined);
  }
  ctx.effect(
    () =>
      ctx.webServer.register({
        kind: "exact",
        path: STATE_PATH,
        handler: (req, res) => {
          if (rejectForeignCaller(req, res)) return;
          try {
            json(res, 200, {
              ok: true,
              panel: { compactRatio: settings.compactRatio },
              pricing: resolvePricing(settings, Date.now(), currentModel()),
              mcp: currentMcpSnapshot(),
            });
          } catch (error) {
            ctx.logger?.warn?.(`dsh-context-panel: state route failed: ${String(error)}`);
            json(res, 500, { ok: false, error: "internal" });
          }
        },
      }),
    "dsh-context-panel: state route",
  );
  // Read-only observation of the assembled tool list and of the model in use.
  //
  // Dispatch semantics, read from `@deepseek-ai/dsh-scope`'s `scopeTarget`: the
  // filter admits a listener whose context carries no scope tag globally, and
  // admits a tagged listener for a matching key or any ancestor key ("events flow
  // up the chain, never down"). This row sits in the profile's global layer, so it
  // is untagged and already receives every scope's assemblies; `global: true` states
  // that intent explicitly and keeps it true if the bundle is ever mounted inside a
  // scope.
  //
  // The waterfall's stability rule is explicit: a listener that does not own the
  // decision must return `next()` — here, the resolved assembly it awaited — which
  // is exactly what the shipped model-selection listener does. Observation happens
  // on the way out, because that is when `variables.provider` and `variables.model`
  // are populated. Observation is wrapped so it can never disturb a model request,
  // and a rejection from `next()` propagates untouched.
  ctx.effect(
    () =>
      ctx.on(
        "system-prompt/assemble",
        async (_assembly, _context, next) => {
          const assembled = await next();
          observeAssembly(assembled);
          return assembled;
        },
        { global: true },
      ),
    "dsh-context-panel: assemble observation",
  );
}
