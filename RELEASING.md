# Releasing dsh-context-panel

Maintainer notes. This file is not part of the published tarball.

## Before the first publish

1. Decide the package name and, if you want a scope, rename it in `package.json`.
   Unscoped names verified free on npm when this was written: `dsh-context-panel`,
   `dsh-session-hud`, `dsh-context-hud`, `dsh-context-inspector`.
2. Fill in the fields a registry page needs and that only you can supply:

   ```jsonc
   {
     "author": "Your Name <you@example.com>",
     "repository": { "type": "git", "url": "git+https://github.com/<you>/dsh-context-panel.git" },
     "homepage": "https://github.com/<you>/dsh-context-panel#readme",
     "bugs": { "url": "https://github.com/<you>/dsh-context-panel/issues" }
   }
   ```

3. Create the public repository and push, so the registry page links somewhere real.
   `dsh-plugin.market` discovers plugins from GitHub and recommends installing a
   scanned commit, so keep the repo and the published version in step.
4. Replace the placeholder copyright holder in `LICENSE` if you want your own name.

## Publish

```sh
npm test                       # 29 headless assertions
npm run test:runtime           # requires a running Host; verifies the served module
npm pack --dry-run             # confirm the file list and size
npm publish                    # add --access public only for a scoped name
```

Then verify from a clean profile rather than the development one:

```sh
dsh plugin --profile scratch add dsh-context-panel
dsh --profile scratch --dump-config | grep context-panel
```

## After publishing

- Bump `version` and add a `CHANGELOG.md` entry for every release.
- A plugin upgrade is uninstall + install (DSH does not auto-update plugins).
- Submit the package to the community catalogs:
  - <https://dsh-plugin.market> — discovers GitHub repos, verifies the plugin
    format, and publishes format/compatibility/security/maintenance signals.
  - awesome lists (`beancookie/awesome-dsh-plugin`,
    `0xsline/awesome-deepseek-harness`, `imsai-sh/awesome-deepseek-harness-plugins`)
    via a pull request adding one line.
  - `@czj-git/dsh-plugin-hub` and similar in-app marketplaces read from public
    catalog APIs; the `dshhub` field in `package.json` is read by catalogs only —
    the DSH runtime does not read it, so never treat it as a security boundary.

## Submission text

Awesome-list line (adjust the repo URL):

```markdown
- [you/dsh-context-panel](https://github.com/you/dsh-context-panel) — 上下文面板：会话头部圆环，展开显示上下文窗口水位与压缩线、距压缩余量、KV 缓存命中率、会话累计与请求数、上下文与 Token 构成、费用估算与 MCP 工具观察。数据来自官方会话投影，唯一网络面是只回环的费率端点。
```

English one-liner:

```markdown
- [you/dsh-context-panel](https://github.com/you/dsh-context-panel) — Context panel: window occupancy with the compaction line, distance to compaction, KV-cache hit rate, session totals, context and token composition, cost estimate, and MCP tool observation — all from official session projections.
```

`dsh-plugin.market` scans GitHub repositories, so no submission form is needed:
push the repo, then check that the scanner picked it up, and quote the pinned
install command it produces:

```sh
dsh plugin --profile desktop add github:you/dsh-context-panel#<scanned-commit>
```

`package.json` already carries a `dshhub` block (display name, summary, categories,
surfaces, and an **empty** network permission list) for catalogs that read it.
The DSH runtime ignores that block entirely — never treat it as a security boundary.

## Field notes (verified against DSH 0.2.0-rc.2)

- `peerDependencies` on `@deepseek-ai/dsh*` is the **only** thing the runtime
  validates (`evaluatePluginCompatibility`). `engines` and any custom
  `dsh.compatibility` / `dshhub.*` fields are author-declared and unread.
- `dsh.client.inject` only orders activation; it does not import anything. Never
  `require()` a Harness Client package as a module.
- Display metadata for the Plugin Manager cards comes from `locale/<lang>.json`
  (`meta.title` / `meta.description`) and the top-level `icon` field, read without
  activating the plugin.
