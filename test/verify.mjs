/**
 * Headless verification for dsh-context-panel's browser half.
 *
 * The official authoring guide allows JavaScript-syntax, manifest and live-slot
 * checks when browser control is unavailable. This goes one step further without
 * a browser: it stubs the module loader and a minimal React, drives the factory
 * and `apply` with a fake client context, then renders the panel tree with fixed
 * figures so the labels and numbers can be read back as text.
 *
 * Run with: npm test   (node test/verify.mjs)
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  DEFAULT_COMPACT_RATIO,
  DEFAULT_CURRENCY,
  STATE_PATH,
  apply as hostApply,
  beijingClock,
  inject as hostInject,
  modelFromAssembly,
  name as hostName,
  normalizeConfig,
  parseWindow,
  resolvePricing,
  summarizeAssembly,
  tariffAt,
  toolWeight,
} from "../index.js";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PACKAGE_DIR = path.join(HERE, "..");
const CLIENT = path.join(PACKAGE_DIR, "client.js");

const failures = [];
/** `title` attributes collected by the last render, for tooltip assertions. */
const renderTitles = [];
function check(label, condition, detail) {
  if (condition) {
    console.log(`  PASS  ${label}`);
  } else {
    failures.push(label);
    console.log(`  FAIL  ${label}${detail ? `  (${detail})` : ""}`);
  }
}

// ---- manifest -----------------------------------------------------------
console.log("== manifest ==");
const manifest = JSON.parse(fs.readFileSync(path.join(PACKAGE_DIR, "package.json"), "utf8"));
check("name", manifest.name === "dsh-context-panel", manifest.name);
check("declares a bundle patch", manifest.dsh?.bundle?.patch === "./cordis.patch.yml");
check("declares a web client half", manifest.dsh?.client?.platform === "web");
check("exports ./client", manifest.exports?.["./client"] === "./client.js");
check(
  "peer range targets the runtime under test",
  (manifest.peerDependencies?.["@deepseek-ai/dsh-session"] ?? "").includes("0.2.0-rc.2"),
  manifest.peerDependencies?.["@deepseek-ai/dsh-session"],
);
for (const locale of ["zh", "en"]) {
  const parsed = JSON.parse(fs.readFileSync(path.join(PACKAGE_DIR, "locale", `${locale}.json`), "utf8"));
  check(`locale/${locale}.json carries meta.title`, typeof parsed.meta?.title === "string");
  check(`locale/${locale}.json carries meta.description`, typeof parsed.meta?.description === "string");
}

// ---- host half: tariff and pricing resolution ----------------------------
console.log("\n== host half: tariff ==");
check("route path is namespaced", STATE_PATH === "/api/dsh-context-panel/state");
check("defaults are stated", DEFAULT_CURRENCY === "CNY");
check(
  "parses a window",
  JSON.stringify(parseWindow("09:00-12:00")) === JSON.stringify({ start: 540, end: 720 }),
  JSON.stringify(parseWindow("09:00-12:00")),
);
for (const bad of ["abc", "12:00-09:00", "25:00-26:00", "", "9-12", null]) {
  check(`rejects malformed window ${JSON.stringify(bad)}`, parseWindow(bad) === undefined);
}

const settings = normalizeConfig(undefined);
// 2026-10-07 is a Wednesday and 2026-10-10 a Saturday; these instants are UTC for
// the stated Beijing wall clock (Beijing = UTC+8).
const wed10 = Date.UTC(2026, 9, 7, 2, 0);
const wed13 = Date.UTC(2026, 9, 7, 5, 0);
const sat10 = Date.UTC(2026, 9, 10, 2, 0);
check("beijing clock shifts the instant", beijingClock(wed10).minutes === 600, String(beijingClock(wed10).minutes));
check("peak inside a window", tariffAt(wed10, settings.windows) === "peak");
check("off-peak between windows", tariffAt(wed13, settings.windows) === "offpeak");
check("weekend is always off-peak", tariffAt(sat10, settings.windows) === "offpeak");

console.log("\n== host half: pricing resolution ==");
const flash = { provider: "deepseek-account", model: "deepseek-flash" };
const peakQuote = resolvePricing(settings, wed10, flash);
check("built-in table prices the observed model", peakQuote.priced === true && peakQuote.source === "builtin");
check("peak rates selected", peakQuote.rates.input === 2 && peakQuote.rates.output === 8, JSON.stringify(peakQuote.rates));
const offpeakQuote = resolvePricing(settings, wed13, flash);
check(
  "off-peak rates selected",
  offpeakQuote.rates.input === 1 && offpeakQuote.rates.output === 4,
  JSON.stringify(offpeakQuote.rates),
);

console.log("\n== host half: model attribution ==");
check(
  "reads the model off the assembled variables",
  JSON.stringify(modelFromAssembly({ variables: { provider: "p", model: "m" } })) === JSON.stringify({ provider: "p", model: "m" }),
);
check("an assembly without a model yields undefined", modelFromAssembly({ variables: {} }) === undefined && modelFromAssembly(undefined) === undefined);
const noModel = resolvePricing(settings, wed10, undefined);
check(
  "nothing observed is reported as such",
  noModel.priced === false && noModel.reason === "no-model-observed" && noModel.model === undefined,
  JSON.stringify(noModel),
);
const unknownQuote = resolvePricing(settings, wed10, { provider: "p", model: "no-such-model" });
check(
  "an unknown model reports the most specific key it tried",
  unknownQuote.priced === false && unknownQuote.reason === "model-not-priced" && unknownQuote.model === "p/no-such-model",
  JSON.stringify(unknownQuote),
);
const unknownBare = resolvePricing(settings, wed10, { model: "no-such-model" });
check(
  "a provider-less observation reports the bare model",
  unknownBare.model === "no-such-model" && unknownBare.reason === "model-not-priced",
  JSON.stringify(unknownBare),
);
const providerKeyed = normalizeConfig({ pricing: { "acme/fast": { input: 5, output: 9 } } });
check(
  "matches a provider/model key before the bare model",
  resolvePricing(providerKeyed, wed10, { provider: "acme", model: "fast" }).rates.input === 5,
);
const override = normalizeConfig({ model: "deepseek-v4-pro" });
check(
  "a configured model overrides the observed one",
  resolvePricing(override, wed10, flash).model === "deepseek-v4-pro",
  resolvePricing(override, wed10, flash).model,
);
const custom = normalizeConfig({ currency: "USD", pricing: { acme: { input: 1, output: 3 } } });
check(
  "flat form applies at any hour",
  resolvePricing(custom, wed10, { model: "acme" }).rates.input === 1 && resolvePricing(custom, wed13, { model: "acme" }).rates.input === 1,
);
check("configured table merges over built-ins", Object.hasOwn(normalizeConfig({ pricing: { acme: { input: 1 } } }).table, "deepseek-flash"));
check(
  "rates from the configured table are labelled config",
  resolvePricing(custom, wed10, { model: "acme" }).source === "config" && resolvePricing(settings, wed10, flash).source === "builtin",
);
const malformed = normalizeConfig({ currency: 42, model: null, peakWindows: "nope", pricing: 7 });
check(
  "malformed config falls back to defaults",
  malformed.currency === "CNY" && malformed.model === undefined && malformed.windows.length === 2,
);

// ---- host half: assembled tool observation --------------------------------
console.log("\n== host half: MCP tool observation ==");
const tool = (name, description, parameters) => ({ name, description, parameters });
const fakeAssembly = {
  tools: [
    tool("read", "Read a file", { type: "object", properties: { path: { type: "string" } } }),
    tool("mcp__github__create_issue", "Open an issue", { type: "object", properties: { title: { type: "string" } } }),
    tool("mcp__my-server__ping", "Ping the server", { type: "object" }),
  ],
};
const summary = summarizeAssembly(fakeAssembly, new WeakMap());
check("counts every assembled tool", summary.totalTools === 3, String(summary.totalTools));
check("counts only mcp__ tools as MCP", summary.mcpTools === 2, String(summary.mcpTools));
check("groups by server", summary.servers.length === 2 && summary.servers.some((s) => s.server === "github"), JSON.stringify(summary.servers.map((s) => s.server)));
check("keeps the hyphenated server name", summary.servers.some((s) => s.server === "my-server"));
check("bytes are accounted", summary.totalBytes > summary.mcpBytes && summary.mcpBytes > 0, `${summary.mcpBytes}/${summary.totalBytes}`);

const emptyAssembly = summarizeAssembly(undefined, new WeakMap());
check("an empty assembly is all zeros", emptyAssembly.totalTools === 0 && emptyAssembly.mcpTools === 0 && emptyAssembly.servers.length === 0);

const circular = { name: "mcp__s__x", description: "d" };
circular.parameters = circular;
let circularThrew = null;
let circularBytes = 0;
try {
  circularBytes = toolWeight(circular, new WeakMap());
} catch (error) {
  circularThrew = error;
}
check("an unserializable schema cannot throw", circularThrew === null, String(circularThrew));
check("an unserializable schema counts as name + description", circularBytes === circular.name.length + circular.description.length, String(circularBytes));

const cache = new WeakMap();
const first = toolWeight(fakeAssembly.tools[0], cache);
check("tool weight is memoized on the tool object", toolWeight(fakeAssembly.tools[0], cache) === first && cache.get(fakeAssembly.tools[0]) === first);

// ---- host half: the route itself -----------------------------------------
// The live route sits behind the web server's auth guard, so it cannot be probed
// from a shell without the browser's session. Driving the handler directly covers
// what that probe could not: the loopback fence, the method fence, and the payload
// contract the client half consumes.
console.log("\n== host half: state route ==");
const registeredRoutes = [];
const observedEvents = [];
const hostCtx = {
  effect: (install) => {
    install();
    return () => {};
  },
  webServer: {
    register: (options) => {
      registeredRoutes.push(options);
      return () => {};
    },
  },
  on: (event, _listener, options) => {
    observedEvents.push({ event, options });
    return () => {};
  },
  logger: { warn: () => {} },
};

let applyThrew = null;
try {
  hostApply(hostCtx, undefined);
} catch (error) {
  applyThrew = error;
}
check("apply() activates with no config", applyThrew === null, String(applyThrew));
check("the plugin name is the package name", hostName === "dsh-context-panel");
check("injects the web server service", hostInject.includes("webServer"));
check("registers exactly one route", registeredRoutes.length === 1, String(registeredRoutes.length));
check(
  "the route is exact and namespaced",
  registeredRoutes[0]?.kind === "exact" && registeredRoutes[0]?.path === STATE_PATH,
  JSON.stringify(registeredRoutes[0]?.path),
);
check(
  "observes the assemble waterfall",
  observedEvents.some((entry) => entry.event === "system-prompt/assemble"),
  observedEvents.map((entry) => entry.event).join(","),
);
check(
  "the observation is registered globally",
  observedEvents.find((entry) => entry.event === "system-prompt/assemble")?.options?.global === true,
  JSON.stringify(observedEvents.find((entry) => entry.event === "system-prompt/assemble")?.options),
);

/** Call the registered handler with a synthetic request and capture the response. */
function callRoute({ method = "GET", host = "localhost:19387", remoteAddress = "127.0.0.1" } = {}) {
  let status = 0;
  let body = "";
  const res = {
    writeHead: (code) => {
      status = code;
    },
    end: (text) => {
      body = text;
    },
  };
  registeredRoutes[0].handler({ method, headers: { host }, socket: { remoteAddress } }, res);
  return { status, body, json: body === "" ? undefined : JSON.parse(body) };
}

const allowed = callRoute();
check("a loopback GET is answered", allowed.status === 200, String(allowed.status));
check("the payload carries both sections", allowed.json?.ok === true && "pricing" in allowed.json && "mcp" in allowed.json, allowed.body);
check("the payload carries the panel section", allowed.json?.panel?.compactRatio === DEFAULT_COMPACT_RATIO, JSON.stringify(allowed.json?.panel));
check("pricing reports a reason before any observation", allowed.json?.pricing?.priced === false && allowed.json.pricing.reason === "no-model-observed", JSON.stringify(allowed.json?.pricing));
check("mcp is null before any observation", allowed.json?.mcp === null);

const posted = callRoute({ method: "POST" });
check("a non-GET is refused with 405", posted.status === 405 && posted.json?.error === "method-not-allowed", String(posted.status));
const foreignAddress = callRoute({ remoteAddress: "10.0.0.5" });
check("a non-loopback peer is refused with 403", foreignAddress.status === 403 && foreignAddress.json?.error === "forbidden", String(foreignAddress.status));
const foreignHost = callRoute({ host: "evil.example.com" });
check("a forged Host header is refused with 403", foreignHost.status === 403 && foreignHost.json?.error === "forbidden", String(foreignHost.status));
const v6 = callRoute({ remoteAddress: "::ffff:127.0.0.1" });
check("an IPv4-mapped loopback peer is allowed", v6.status === 200, String(v6.status));

console.log("\n== host half: compaction ratio ==");
check("defaults to the compaction service's own default", normalizeConfig(undefined).compactRatio === DEFAULT_COMPACT_RATIO);
check("a configured ratio is served back", normalizeConfig({ compactRatio: 0.9 }).compactRatio === 0.9);
for (const bad of [0, -0.2, 1.5, "0.9", Number.NaN, null]) {
  check(`rejects out-of-range ratio ${JSON.stringify(bad)}`, normalizeConfig({ compactRatio: bad }).compactRatio === DEFAULT_COMPACT_RATIO);
}

// ---- module loader stub -------------------------------------------------
let captured;
globalThis.window = {
  __ModuleLoader__: {
    load(module) {
      captured = module;
    },
  },
};

const clientSource = fs.readFileSync(CLIENT, "utf8");
new Function(clientSource)();

// ---- theme tokens -------------------------------------------------------
// Every custom property below was checked against the tokens DSH 0.2.0-rc.2
// actually defines. A typo or a rename does not error — the declaration silently
// falls back — so the set is asserted rather than trusted.
console.log("\n== theme tokens ==");
const KNOWN_TOKENS = new Set([
  "--dsw-alias-bg-base",
  "--dsw-alias-bg-layer-2",
  "--dsw-alias-border-l1",
  "--dsw-alias-border-l2",
  "--dsw-alias-interactive-bg-hover",
  "--dsw-alias-interactive-bg-hover-danger",
  "--dsw-alias-label-caption",
  "--dsw-alias-label-primary",
  "--dsw-alias-label-secondary",
  "--dsw-alias-label-tertiary",
  "--dsw-alias-scrollbar-bg-l2",
  "--dsw-alias-scrollbar-hover-l2",
  "--dsw-alias-settings-card-fill",
  "--dsw-alias-state-business-primary",
  "--dsw-alias-state-error-primary",
  "--dsw-alias-state-success-primary",
  "--dsw-alias-state-warn-primary",
  "--dsw-elevation-prominent",
  "--dsw-font-markdown-code-font-family",
  "--dsw-menu-backdrop-filter",
  "--dsw-radius-lg",
  "--dsw-radius-md",
  "--dsw-radius-sm",
  "--dsw-radius-xs",
  "--dsw-shadow-lv2",
  "--dsw-specific-menu",
  "--dsw-static-deepseek-300",
  // Hooks this plugin *defines* for the host's own scrollbars, not consumables.
  "--dsh-scrollbar-thumb",
  "--dsh-scrollbar-thumb-hover",
]);
const referenced = [...new Set([...clientSource.matchAll(/var\((--[a-z0-9-]+)/g)].map((m) => m[1]))].sort();
// `--dcp-*` are this plugin's own size knobs; every other name must be a host token.
const localVars = referenced.filter((token) => token.startsWith("--dcp-"));
const hostTokens = referenced.filter((token) => !token.startsWith("--dcp-"));
check("the panel exposes its size knobs", localVars.length >= 8, String(localVars.length));
for (const token of hostTokens) {
  check(`host theme token exists: ${token}`, KNOWN_TOKENS.has(token));
}
const declaredLocals = new Set([...clientSource.matchAll(/(--dcp-[a-z0-9-]+)\s*:/g)].map((m) => m[1]));
for (const token of localVars) {
  check(`plugin variable is declared: ${token}`, declaredLocals.has(token));
}
const unusedLocals = [...declaredLocals].filter((token) => !localVars.includes(token));
check("no declared plugin variable is unused", unusedLocals.length === 0, unusedLocals.join(", "));
const definedHooks = [...clientSource.matchAll(/(--dsh-scrollbar-[a-z-]+)\s*:/g)].map((m) => m[1]);
for (const token of definedHooks) {
  check(`host hook name is known: ${token}`, KNOWN_TOKENS.has(token));
}

// ---- minimal React ------------------------------------------------------
// `pendingSeed` lets one render start the first non-boolean state at a chosen
// value, which is how the host's tariff payload is supplied without awaiting the
// component's fetch effect.
let pendingSeed;
/** Every state write the component performs, so a policy can be asserted behaviourally. */
const stateWrites = [];
/** Every element the last render produced, so a test can invoke its handlers. */
const renderNodes = [];
const React = {
  createElement(type, props, ...children) {
    return { type, props: props ?? {}, children: children.flat(Infinity).filter((c) => c !== undefined) };
  },
  useState: (init) => {
    let value = typeof init === "boolean" ? true : init;
    if (typeof init !== "boolean" && pendingSeed !== undefined) {
      value = pendingSeed;
      pendingSeed = undefined;
    }
    const slot = { value };
    return [
      value,
      (next) => {
        slot.value = typeof next === "function" ? next(slot.value) : next;
        stateWrites.push(slot.value);
      },
    ];
  },
  useRef: () => ({ current: null }),
  useEffect: () => {},
  Fragment: "Fragment",
};

console.log("\n== factory ==");
check("loader registered an id", captured?.id === "dsh-context-panel", `id=${captured?.id}`);
check("loader registered a factory", typeof captured?.factory === "function");

const mod = captured.factory((specifier) => {
  if (specifier === "react") return React;
  throw new Error(`unexpected require("${specifier}")`);
});

// ---- apply() against a fake client context ------------------------------
const registered = [];
const effects = [];
const injectedSlots = [];
const injectedServices = [];
const dictionaries = [];
const tabTypes = [];
const openedTabs = [];

const ctx = {
  effect: (fn, label) => {
    effects.push({ fn, label });
    return () => {};
  },
  locale: {
    register: (ns, dicts) => {
      dictionaries.push({ ns, dicts });
      return () => {};
    },
    bind: (ns) => (key, params) => {
      const dicts = dictionaries.find((entry) => entry.ns === ns)?.dicts ?? {};
      const raw = dicts.zh?.[key] ?? key;
      return params ? raw.replace(/\{(\w+)\}/g, (_, name) => String(params[name])) : raw;
    },
  },
  slots: {
    inject: (name, contribute) => {
      injectedSlots.push(name);
      contribute();
      return () => {};
    },
    register: (options, component) => {
      registered.push({ options, component });
      return () => {};
    },
  },
  inject: (services, contribute) => {
    injectedServices.push(services);
    contribute(ctx);
    return () => {};
  },
  get: (name) =>
    name === "sidebarRight"
      ? {
          openTab: (kind, options) => {
            openedTabs.push({ kind, options });
          },
        }
      : undefined,
  sidebarRightTabs: {
    register: (definition) => {
      tabTypes.push(definition);
      return () => {};
    },
  },
  logger: { warn: () => {} },
};

console.log("\n== apply() ==");
check("exports apply and inject", typeof mod.apply === "function" && Array.isArray(mod.inject));
check("inject lists slots + locale", mod.inject.includes("slots") && mod.inject.includes("locale"));
check(
  "the sidebar services stay out of the plugin-level deps",
  !mod.inject.includes("sidebarRight") && !mod.inject.includes("sidebarRightTabs"),
  mod.inject.join(","),
);
mod.apply(ctx);
for (const effect of effects) effect.fn();
check("contributes to the session header actions slot", injectedSlots.includes("conversation.session.header.actions"));
check("contributes the docked pane", injectedSlots.includes("sidebar.right.pane.tab"));
check("contributes the docked pane title", injectedSlots.includes("sidebar.right.pane.tab.title"));
check(
  "injects the sidebar services conditionally",
  injectedServices.some((list) => list.includes("sidebarRight") && list.includes("sidebarRightTabs")),
  JSON.stringify(injectedServices),
);
check("registers exactly three slot entries", registered.length === 3, `count=${registered.length}`);

const entry = registered.find((row) => row.options.name === "conversation.session.header.actions");
const pane = registered.find((row) => row.options.name === "sidebar.right.pane.tab");
const paneTitle = registered.find((row) => row.options.name === "sidebar.right.pane.tab.title");
check("slot entry name", entry?.options?.name === "conversation.session.header.actions");
check("slot entry id is the package name", entry?.options?.id === "dsh-context-panel");
check("slot entry carries a locale namespace", typeof entry?.options?.locale === "string");
check("component is a function", typeof entry?.component === "function");
check("the pane is keyed by the plugin id", pane?.options?.key === "dsh-context-panel", String(pane?.options?.key));
check("the pane title is keyed the same way", paneTitle?.options?.key === "dsh-context-panel");
check("the pane component is a function", typeof pane?.component === "function");
check("the pane title component is a function", typeof paneTitle?.component === "function");
check("dictionaries registered for zh and en", dictionaries.length === 1 && !!dictionaries[0].dicts.zh && !!dictionaries[0].dicts.en);

console.log("\n== sidebar tab type ==");
const definition = tabTypes[0];
check("registers exactly one tab type", tabTypes.length === 1, String(tabTypes.length));
check("the type id is the plugin id", definition?.id === "dsh-context-panel", String(definition?.id));
check("the type kind is the one the button opens", definition?.kind === "context-panel", String(definition?.kind));
check("the pane stays mounted across tab switches", definition?.keepMounted === true);
check("the title resolves through the locale service", definition?.title() === dictionaries[0].dicts.zh["sidebar.title"], String(definition?.title?.()));

console.log("\n== open in sidebar ==");
const injectedProps = typeof entry.options.inject === "function" ? entry.options.inject() : entry.options.inject;
check("the popover receives the opener", typeof injectedProps?.openInSidebar === "function");
injectedProps.openInSidebar();
check(
  "the opener opens the registered kind",
  openedTabs.length === 1 && openedTabs[0].kind === definition.kind,
  JSON.stringify(openedTabs),
);
// The sidebar services are injected conditionally precisely so this test's premise
// holds: the popover registration above is outside that callback and cannot be
// affected by the docked pane's services being absent.
check("the popover registration is independent of the sidebar", registered[0].options.name === "conversation.session.header.actions");

const dictionary = dictionaries[0].dicts;

// ---- dictionary coverage -------------------------------------------------
// A key the component calls but the dictionary lacks renders as a raw key in the
// UI; a key nothing calls is dead weight. Assert both directions.
console.log("\n== dictionary coverage ==");
const calledKeys = [...new Set([...clientSource.matchAll(/\bt\("([A-Za-z0-9_.]+)"/g)].map((m) => m[1]))].sort();
for (const key of calledKeys) {
  check(`zh has ${key}`, typeof dictionary.zh[key] === "string");
  check(`en has ${key}`, typeof dictionary.en[key] === "string");
}
const definedKeys = Object.keys(dictionary.zh);
const unusedKeys = definedKeys.filter((key) => !calledKeys.includes(key));
check("no unused zh key", unusedKeys.length === 0, unusedKeys.join(", "));
const missingEn = definedKeys.filter((key) => typeof dictionary.en[key] !== "string");
check("zh and en define the same keys", missingEn.length === 0, missingEn.join(", "));
const extraEn = Object.keys(dictionary.en).filter((key) => typeof dictionary.zh[key] !== "string");
check("en defines no key zh lacks", extraEn.length === 0, extraEn.join(", "));

// ---- render the tree ----------------------------------------------------
const sample = {
  tokenUsage: {
    uncachedInputTokens: 120000,
    cacheReadTokens: 800000,
    cacheWriteTokens: 0,
    outputTokens: 25300,
  },
  contextPressure: { pressureTokens: 455300, projectedTokens: 460000, contextWindow: 1000000 },
  contextBreakdown: { systemTokens: 12000, toolsTokens: 38000, messageTokens: 405300 },
  sessionStats: {
    turns: 12,
    steps: 42,
    llmMs: 235000,
    toolMs: 61000,
    ttftMs: 84000,
    ttftSteps: 42,
    decodeMs: 90000,
    decodeTokens: 25300,
  },
};

function render(component, projection, now, options = {}) {
  const t = (key, params) => {
    const raw = dictionary[now][key] ?? `«${key}»`;
    return params ? raw.replace(/\{(\w+)\}/g, (_, name) => String(params[name])) : raw;
  };
  const props = {};
  if (!options.omitKit) {
    props.sessionId = "verify";
    if (projection) props.useProjection = projection;
  }
  if (!options.omitLocale) props.t = t;
  renderTitles.length = 0;
  renderNodes.length = 0;
  stateWrites.length = 0;
  pendingSeed = options.seedState;
  const roots = component(props);
  pendingSeed = undefined;
  const out = [];
  const walk = (node) => {
    if (node === null || node === undefined || typeof node === "boolean") return;
    if (Array.isArray(node)) {
      for (const child of node) walk(child);
      return;
    }
    if (typeof node === "string" || typeof node === "number") {
      out.push(String(node));
      return;
    }
    renderNodes.push(node);
    if (node.props?.title !== undefined) renderTitles.push(String(node.props.title));
    if (typeof node.type === "function") {
      walk(node.type(node.props));
      return;
    }
    for (const child of node.children ?? []) walk(child);
  };
  walk(roots);
  return out.join(" | ");
}

const flat = render(entry.component, (key) => sample[key], "zh");console.log("\n== rendered text (zh) ==");
console.log(flat);

console.log("\n== figures ==");
check("occupancy percentage", flat.includes("46%"));
check("used / window", flat.includes("455.3K / 1M"));
check("distance to compaction", flat.includes("344.7K"));
check("healthy status pill", flat.includes(dictionary.zh["status.healthy"]));
check("compaction threshold marker", flat.includes("80%"));
check("cache hit rate", flat.includes("87.0%"));
check("cumulative tokens", flat.includes("945.3K"));
check("request count", flat.includes("42"));
check("runtime", flat.includes("4m56s"));
check(
  "composition rows",
  flat.includes(dictionary.zh["part.uncached"]) &&
    flat.includes(dictionary.zh["part.cacheRead"]) &&
    flat.includes(dictionary.zh["part.output"]) &&
    flat.includes(dictionary.zh["part.system"]),
);
check("detail table", flat.includes(dictionary.zh["detail.contextWindow"]) && flat.includes("tok/s"));

console.log("\n== i18n ==");
const flatEn = render(entry.component, (key) => sample[key], "en");
check("english dictionary renders", flatEn.includes(dictionary.en["window.title"]) && flatEn.includes(dictionary.en["status.healthy"]));

// ---- cost rows ----------------------------------------------------------
// The third useState holds the host's tariff payload; seed it to exercise the
// priced and unpriced render paths. The fetch wiring itself is a five-line effect
// that cannot be awaited by this harness — see the README's verification limits.
console.log("\n== cost rows ==");
const unpriced = render(entry.component, (key) => sample[key], "zh", {
  seedState: {
    ok: true,
    pricing: { priced: false, currency: "CNY", model: "deepseek-flash", tariff: "peak", reason: "model-not-priced" },
  },
});
check("unpriced shows the not-estimable label", unpriced.includes(dictionary.zh["cost.unknown"]));
check(
  "an unknown model explains itself in the tooltip",
  renderTitles.some((title) => title.includes("费率表里没有")),
  renderTitles.join(" / "),
);

const unobserved = render(entry.component, (key) => sample[key], "zh", {
  seedState: { ok: true, pricing: { priced: false, currency: "CNY", tariff: "peak", reason: "no-model-observed" } },
});
check("an unobserved model explains itself in the tooltip", renderTitles.some((title) => title.includes("还没有观察到模型")), renderTitles.join(" / "));

// 120000 uncached * 1 + 800000 cacheRead * 0.02 + 25300 output * 4 = 237200 → ¥0.2372
const priced = render(entry.component, (key) => sample[key], "zh", {
  seedState: {
    ok: true,
    pricing: {
      priced: true,
      currency: "CNY",
      model: "deepseek-flash",
      tariff: "offpeak",
      rates: { input: 1, cacheRead: 0.02, cacheWrite: 0, output: 4 },
      source: "builtin",
    },
  },
});
console.log(priced);
check("cost equals buckets times rates", priced.includes("¥0.2372"), "expected ¥0.2372");
check("cost names the priced model", priced.includes("deepseek-flash"));
check("cost names the tariff", priced.includes(dictionary.zh["cost.offpeak"]));
check("built-in rates are flagged for review", priced.includes(dictionary.zh["cost.sourceBuiltin"]));

const configured = render(entry.component, (key) => sample[key], "zh", {
  seedState: {
    ok: true,
    pricing: {
      priced: true,
      currency: "USD",
      model: "acme",
      tariff: "peak",
      rates: { input: 2, cacheRead: 0.04, cacheWrite: 0, output: 8 },
      source: "config",
    },
  },
});
check("configured rates render in their currency", configured.includes("$0.4744"), "expected $0.4744");
check("configured source is labelled", configured.includes(dictionary.zh["cost.sourceConfig"]));
check("peak tariff is labelled", configured.includes(dictionary.zh["cost.peak"]));

console.log("\n== MCP tool card ==");
const unpricedPricing = { priced: false, currency: "CNY", model: "x", tariff: "peak" };
// No observation yet (the host has not answered, or has never seen a request).
const noMcp = render(entry.component, (key) => sample[key], "zh", {
  seedState: { ok: true, pricing: unpricedPricing },
});
check("no observation shows the pending hint", noMcp.includes(dictionary.zh["mcp.pending"]));

// Observed, but this session uses no MCP tools: the card must say so and report the
// total, which is what tells the reader the observer actually ran.
const zeroMcp = render(entry.component, (key) => sample[key], "zh", {
  seedState: {
    ok: true,
    pricing: unpricedPricing,
    mcp: { observations: 1, totalTools: 5, totalBytes: 1000, mcpTools: 0, mcpBytes: 0, servers: [] },
  },
});
check("an observation without MCP tools reports the total", zeroMcp.includes("共 5 个工具"), zeroMcp.slice(0, 120));

const withMcp = render(entry.component, (key) => sample[key], "zh", {
  seedState: {
    ok: true,
    pricing: unpricedPricing,
    mcp: {
      observedAt: Date.now(),
      observations: 3,
      totalTools: 12,
      totalBytes: 40000,
      mcpTools: 3,
      mcpBytes: 9000,
      servers: [{ server: "github", tools: 3, bytes: 9000 }],
    },
  },
});
console.log(withMcp);
check("names each MCP server", withMcp.includes("github"));
check("reports the server tool count", withMcp.includes("3 个工具"));
check("reports per-server schema weight", withMcp.includes("8.8KB"), "expected 8.8KB");
check("reports the MCP share of all tools", withMcp.includes("3 / 12"), "expected 3 / 12");
check("reports the weight ratio", withMcp.includes("39.1KB"), "expected 39.1KB total");

console.log("\n== sidebar pane ==");
// The pane must show the same numbers as the popover: both render one `derivePanel`.
const paneText = render(pane.component, (key) => sample[key], "zh", {
  seedState: {
    ok: true,
    panel: { compactRatio: 0.8 },
    pricing: {
      priced: true,
      currency: "CNY",
      model: "deepseek-flash",
      tariff: "offpeak",
      rates: { input: 1, cacheRead: 0.02, cacheWrite: 0, output: 4 },
      source: "builtin",
    },
    mcp: {
      observations: 2,
      totalTools: 12,
      totalBytes: 40000,
      mcpTools: 3,
      mcpBytes: 9000,
      servers: [{ server: "github", tools: 3, bytes: 9000 }],
    },
  },
});
console.log(paneText);
check("the pane shows the window", paneText.includes("455.3K / 1M"));
check("the pane shows the distance", paneText.includes("344.7K"));
check("the pane shows the compaction marker", paneText.includes("压缩线 80%"));
check("the pane shows the cache hit rate", paneText.includes("87.0%"));
check("the pane shows the request count", paneText.includes("42"));
check("the pane shows the cost", paneText.includes("¥0.2372"), "expected ¥0.2372");
check("the pane names the priced model", paneText.includes("deepseek-flash"));
check("the pane lists the MCP server", paneText.includes("github"));
check(
  "the pane shows details without a toggle",
  paneText.includes(dictionary.zh["detail.contextWindow"]) && paneText.includes("tok/s"),
);
const paneEmpty = render(pane.component, () => undefined, "zh");
check("the pane degrades on an empty session", paneEmpty.includes(dictionary.zh["panel.empty"]));
check(
  "the pane title renders its label",
  render(paneTitle.component, () => undefined, "zh").includes(dictionary.zh["sidebar.title"]),
);

console.log("\n== popover: hover opens, leaving closes ==");
render(entry.component, (key) => sample[key], "zh");
const nodesOf = () => ({
  wrapper: renderNodes.find((node) => node.props?.className === "dcp-wrap"),
  trigger: renderNodes.find((node) => node.props?.className === "dcp-trigger"),
});
const popoverNodes = nodesOf();
check(
  "the wrapper takes pointer handlers",
  typeof popoverNodes.wrapper?.props?.onPointerEnter === "function" && typeof popoverNodes.wrapper?.props?.onPointerLeave === "function",
);
check("the trigger keeps a click handler", typeof popoverNodes.trigger?.props?.onClick === "function");
check("the trigger opens on focus for keyboard users", typeof popoverNodes.trigger?.props?.onFocus === "function");

stateWrites.length = 0;
popoverNodes.wrapper.props.onPointerEnter({ pointerType: "mouse" });
check("a mouse entering opens it", stateWrites.at(-1) === true, JSON.stringify(stateWrites));
stateWrites.length = 0;
popoverNodes.wrapper.props.onPointerLeave({ pointerType: "mouse" });
check("a mouse leaving closes it", stateWrites.at(-1) === false, JSON.stringify(stateWrites));
stateWrites.length = 0;
popoverNodes.trigger.props.onClick();
check("a mouse click does not fight the hover", stateWrites.length === 0, JSON.stringify(stateWrites));
stateWrites.length = 0;
popoverNodes.wrapper.props.onPointerEnter({ pointerType: "touch" });
check("a touch never opens on hover", stateWrites.length === 0, JSON.stringify(stateWrites));
popoverNodes.trigger.props.onClick();
check("a touch click still toggles", stateWrites.length === 1, JSON.stringify(stateWrites));

// A fresh render leaves the pointer kind unset, which is the keyboard path.
render(entry.component, (key) => sample[key], "zh");
stateWrites.length = 0;
nodesOf().trigger.props.onClick();
check("keyboard activation still toggles", stateWrites.length === 1, JSON.stringify(stateWrites));

console.log("\n== each surface states its own scale ==");
const bodySizeIn = (selector) => Number(new RegExp(`\\${selector}\\{[^}]*--dcp-body:(\\d+)px`).exec(clientSource)?.[1]);
const popoverBody = bodySizeIn(".dcp-wrap");
const paneBody = bodySizeIn(".dcp-pane");
check("the popover defines a body size", Number.isFinite(popoverBody), String(popoverBody));
check("the pane defines its own body size", Number.isFinite(paneBody), String(paneBody));
check("the docked pane never reads larger than the popover", paneBody <= popoverBody, `${paneBody}px vs ${popoverBody}px`);

console.log("\n== degrade paths ==");
const empty = render(entry.component, () => undefined, "zh");
check("empty session shows the empty hint", empty.includes(dictionary.zh["panel.empty"]));

// A kit that stops supplying its props must degrade, never throw: a throwing
// component blanks the whole slot entry.
let bareThrew = null;
let bare = "";
try {
  bare = render(entry.component, undefined, "zh", { omitKit: true });
} catch (error) {
  bareThrew = error;
}
check("renders with no kit props at all", bareThrew === null, String(bareThrew));
check("missing kit falls back to the empty hint", bare.includes(dictionary.zh["panel.empty"]));

let noLocaleThrew = null;
try {
  render(entry.component, (key) => sample[key], "zh", { omitLocale: true });
} catch (error) {
  noLocaleThrew = error;
}
check("renders without the locale function", noLocaleThrew === null, String(noLocaleThrew));

const noWindow = render(
  entry.component,
  (key) => (key === "tokenUsage" ? sample.tokenUsage : key === "contextBreakdown" ? sample.contextBreakdown : undefined),
  "zh",
);
check("missing context window degrades to its note", noWindow.includes(dictionary.zh["window.noWindow"]));

const noStats = render(entry.component, (key) => (key === "sessionStats" ? undefined : sample[key]), "zh");
check("missing sessionStats shows the em dash", noStats.includes(dictionary.zh["metrics.none"]));

const overThreshold = render(
  entry.component,
  (key) =>
    key === "contextPressure"
      ? { pressureTokens: 920000, contextWindow: 1000000 }
      : key === "tokenUsage"
        ? sample.tokenUsage
        : key === "contextBreakdown"
          ? sample.contextBreakdown
          : undefined,
  "zh",
);
check("past the compaction line reports it", overThreshold.includes(dictionary.zh["window.over"]));
check("past the compaction line flips the pill", overThreshold.includes(dictionary.zh["status.watch"]));

console.log("\n== compaction marker follows the host ==");
const defaultMarker = render(entry.component, (key) => sample[key], "zh");
check("without a host answer the marker stays at the default", defaultMarker.includes("压缩线 80%"), defaultMarker.slice(0, 120));
const customMarker = render(entry.component, (key) => sample[key], "zh", {
  seedState: { ok: true, panel: { compactRatio: 0.9 }, pricing: { priced: false, currency: "CNY", tariff: "peak" } },
});
check("a configured ratio moves the marker", customMarker.includes("压缩线 90%"), "expected 90%");
// At 0.9 the sample's 45.5% occupancy is still healthy, and the distance shrinks.
check(
  "the distance follows the configured ratio",
  customMarker.includes("距压缩 444.7K"),
  customMarker.match(/距压缩 [0-9.]+K/)?.[0] ?? "no distance",
);

console.log("");
if (failures.length) {
  console.log(`${failures.length} check(s) failed:`);
  for (const failure of failures) console.log(`  - ${failure}`);
  process.exit(1);
}
console.log("all checks passed");
