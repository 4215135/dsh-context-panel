/**
 * Runtime verification without a browser.
 *
 * A DSH Web host serves the client-module graph over an SSE channel and each
 * client bundle over a module route. Both are reachable without the browser's
 * session, so a contributor can prove that a plugin is loaded by the running
 * host and that the module the browser will fetch is byte-for-byte the file in
 * this repository.
 *
 * Usage:
 *   node test/runtime-graph.mjs [id] [base-url] [ms] [local-client-file]
 *
 * Defaults target this plugin on the default Desktop Web port:
 *   node test/runtime-graph.mjs
 *
 * Exit code 0 means the entry is in the graph and (when a local file is given)
 * the served module matches it apart from the host's own sourcemap suffix.
 */
import fs from "node:fs";
import crypto from "node:crypto";

const id = process.argv[2] ?? "dsh-context-panel";
const base = (process.argv[3] ?? "http://127.0.0.1:19387").replace(/\/$/, "");
const budgetMs = Number(process.argv[4] ?? 5000);
const localFile = process.argv[5] ?? "client.js";

const failures = [];
const check = (label, ok, detail) => {
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${label}${detail ? `  (${detail})` : ""}`);
  if (!ok) failures.push(label);
};

/** Read the SSE channel for `budgetMs`; the channel never ends by design. */
async function readGraph() {
  const controller = new AbortController();
  setTimeout(() => controller.abort(), budgetMs);
  let text = "";
  try {
    const response = await fetch(`${base}/plugins/events`, {
      signal: controller.signal,
      headers: { Accept: "text/event-stream" },
    });
    if (response.status !== 200) return { status: response.status, text: "" };
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      text += decoder.decode(value, { stream: true });
    }
  } catch {
    /* deadline abort is the expected exit */
  }
  return { status: 200, text };
}

console.log(`== client-module graph @ ${base} ==`);
const { status, text } = await readGraph();
check("graph channel reachable", status === 200, `status=${status}`);

const frameLine = text
  .split("\n")
  .find((line) => line.startsWith("data: ") && line.includes('"type":"graph"'));
check("graph frame received", Boolean(frameLine));
if (!frameLine) {
  console.log("nothing to inspect; is the Host running on this port?");
  process.exit(1);
}

const graph = JSON.parse(frameLine.slice("data: ".length)).graph;
console.log(`  graph rev=${graph.rev}  entries=${graph.entries.length}`);

const entry = graph.entries.find((candidate) => candidate.id === id);
check(`${id} is in the client graph`, Boolean(entry));
if (!entry) {
  console.log(`  entries seen: ${graph.entries.map((e) => e.id).join(", ")}`);
  process.exit(1);
}
console.log(JSON.stringify(entry, null, 2));

for (const dependency of entry.inject ?? []) {
  check(`injected service present: ${dependency}`, graph.entries.some((e) => e.id === dependency));
}
console.log(`  (immediately=${entry.immediately === true}; UI entries load lazily either way)`);

// The module route is `plugins/??<id>/client.js&rev=<rev>` on this build.
const moduleUrl = `${base}/${entry.url.startsWith("/") ? entry.url.slice(1) : entry.url}`;
console.log(`\n== served module @ ${moduleUrl} ==`);
const served = await fetch(moduleUrl);
check("module route answers 200", served.status === 200, `status=${served.status}`);
const servedText = await served.text();
check("served module declares this package id", servedText.includes(`"${id}"`));

if (localFile && fs.existsSync(localFile)) {
  const normalize = (value) => value.replace(/\r\n/g, "\n");
  const local = normalize(fs.readFileSync(localFile, "utf8"));
  const remote = normalize(servedText);
  // The Host appends its own sourcemap comment to the verbatim file.
  const suffix = remote.slice(local.length);
  check(
    "served module is the local file plus the host suffix",
    remote.startsWith(local) && /^\s*;?\s*\/\/# sourceMappingURL=/.test(suffix),
    suffix.trim().slice(0, 80),
  );
  const hash = (value) => crypto.createHash("sha256").update(value).digest("hex").slice(0, 16);
  console.log(`  local  ${local.length} chars  sha256:${hash(local)}`);
  console.log(`  served ${remote.length} chars  sha256:${hash(remote)}`);
}

console.log("");
if (failures.length) {
  console.log(`${failures.length} check(s) failed:`);
  for (const failure of failures) console.log(`  - ${failure}`);
  process.exit(1);
}
console.log("runtime verification passed");
