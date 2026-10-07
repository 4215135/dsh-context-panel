# dsh-context-panel

> **English summary** — A context panel for DeepSeek Harness (Web / Desktop). A header
> ring opens a popover with: context-window occupancy against the routed window and the
> compaction threshold, distance to compaction, KV-cache hit rate, session totals and
> request count, context and token composition, an optional cost estimate, and an
> observation of the MCP tools the model is paying for. Every figure except the tariff
> comes from official session projections (`tokenUsage`, `contextPressure`,
> `contextBreakdown`, `sessionStats`) read through the slot kit's `useProjection` — no
> RPC, no persisted state, no credential access. The only network surface is one
> loopback-only, GET-only route that returns this row's own rate table.
> Requirements: DSH `0.2.0-rc.2`, Node ≥ 22. MIT.

DeepSeek Harness（Web / Desktop）的**上下文面板**。两种界面，同一套数字：

- **会话头部圆环**——点开即走，适合快速一瞥；
- **右侧栏常驻面板**——点浮层里的「**在侧边栏打开**」把它停靠到对话旁边一直显示。停靠、标签切换、**收起/最小化（折叠整栏）**、关闭都由宿主的右侧栏坞提供，本插件不重复实现；面板声明了 `keepMounted`，切到别的标签再切回来时它已取到的数据还在。

面板内容：上下文窗口水位与压缩线、距压缩余量、KV 缓存命中率、会话累计与请求数，以及上下文构成和 Token 构成两套拆分。

面板的每个数字都来自**官方会话投影**（`tokenUsage`、`contextPressure`、`contextBreakdown`、`sessionStats`），通过 slot kit 的 `useProjection` 读取：**不联网、不发 RPC、不落盘、不读凭据**。宿主半区是空的，只为让浏览器半区有一个 specifier 等于包名的 Loader 行。

## 面板内容

| 区块 | 数字 | 来源 |
|---|---|---|
| 上下文窗口 | 已用 / 窗口大小、占用百分比、**压缩线 80%** 刻度、距压缩余量、状态胶囊（上下文充足 / 即将压缩 / 已达压缩阈值） | `contextPressure.pressureTokens` + `contextPressure.contextWindow` |
| 会话指标 | 平均命中（缓存读 / 全部提示词）、累计 tokens、请求数、运行时间（模型 + 工具耗时） | `tokenUsage.*`、`sessionStats.steps / llmMs / toolMs` |
| 用量分析 · 上下文构成 | 系统提示 / 工具 / 消息，堆叠条 + 图例 | `contextBreakdown.systemTokens / toolsTokens / messageTokens` |
| 用量分析 · Token 构成 | 提示词（未缓存输入）/ 缓存读取 / 缓存写入 / 回复，占比堆叠条 + 图例 | `tokenUsage.uncachedInputTokens / cacheReadTokens / cacheWriteTokens / outputTokens` |
| 会话费用 | 按宿主下发的费率把四桶 token 折成金额；未定价时显示「费用不可估算」并说明原因 | 宿主半区的只回环端点（见下）；模型由 `system-prompt/assemble` 上的只读观察自动归属 |
| MCP 工具 | 最近一次组装请求里来自 MCP 的工具数、按服务器的 schema 体积，以及 MCP 占全部工具的比例；三态提示（未观察到组装结果 / 已观察但无 MCP 工具并报出工具总数 / 按服务器列出） | 宿主半区的 `system-prompt/assemble` 只读观察（见下） |
| 明细 | 以上全部原始值 + 首 token 平均耗时、生成速度、计价模型、当前时段、费率来源 | `sessionStats.ttftMs / ttftSteps / decodeMs / decodeTokens` |

## 两种界面

| | 会话头部浮层 | 右侧栏常驻面板 |
|---|---|---|
| 打开 | **鼠标移到圆环上即开**；键盘聚焦也开 | 浮层右上角「在侧边栏打开」；已打开时切到它的标签 |
| 关闭 | **鼠标移开即关**（浮层是触发器的子节点，移进去不会关）；Esc 关闭 | 用宿主右侧栏的收起控件（`sidebar.right.toggle` 快捷键同样可以切） |
| 触屏 / 键盘 | 没有悬停可用，点击（或回车）照旧开关——这条策略抽成了纯函数并有断言 | — |
| 布局 | 380px 浮层，内部滚动 | 占满栏宽，单列卡片，**明细表常显**；两处各自声明一套尺寸（见下） |
| 数据 | 打开时取一次宿主数据 | 挂载时取一次；`keepMounted` 让它在标签切换间保留 |
| 实现 | `Panel` | `SidebarPane` |

两者都调用同一个 `derivePanel`——**数字、单位、标签只有一处来源**，两个界面不可能算出不同的值。右侧栏服务（`sidebarRight`、`sidebarRightTabs`）是用 `ctx.inject` **条件注入**的，缺少右侧栏的部署照样保留头部浮层。

面板尺寸集中在 `--dcp-*` 变量上，**两个界面各自声明一套**（都不靠继承，避免一边改了另一边跟着跑）：浮层在 `.dcp-wrap`（宽 380px、正文 12px、数值 15px），停靠面板在 `.dcp-pane`（同样 12px，窄栏里不再放大）。断言保证两套都存在、且停靠面板的字号**不大于**浮层。要再调就是改这几个数字。

「压缩线 80%」画的是 `@deepseek-ai/dsh-compaction-basic` 的**默认**阈值（路由上下文窗口的 0.8）。按 provider/model 覆盖的 `modelPolicies` 插件读不到，所以改过阈值的部署请在插件行里用 `compactRatio` 声明同一个数字，刻度与「距压缩」余量都会跟着走。

组合里没有 `@deepseek-ai/dsh-session-stats` 时，请求数 / 运行时间 / 首 token / 生成速度显示 `—`，其余照常。

## 安装

### 图形界面（推荐）

侧栏 **插件** → **添加插件** → 填本目录的绝对路径 → 安装完成后点**立即启用**，然后重启 Harness（或刷新页面）。

### 命令行

```sh
dsh plugin --profile desktop add /绝对路径/dsh-context-panel
```

该命令会在 profile 目录执行 `pnpm`，成功后把声明了 `dsh.bundle` 的依赖自动并入 `dsh.profile.bundles`。

> **Windows 路径含空格时的坑**：`dsh plugin` 在 Windows 上以 `shell: true` 拼接命令行，参数数组里的空格会被劈成两个 spec，导致装出 `link:D:/deepseek` 这类坏依赖并触发 prune。含空格的目录请改用图形界面安装，或先做一个无空格的 junction：
>
> ```cmd
> mklink /J D:\dsh-plugins\dsh-context-panel "D:\含 空格\的路径\dsh-context-panel"
> dsh plugin --profile desktop add D:\dsh-plugins\dsh-context-panel
> ```

安装后校验：

```sh
dsh --profile desktop --dump-config | findstr context-panel
```

## 费用估算与 MCP 观察

**为什么需要宿主半区**：公开的 13 个会话投影键（`tokenUsage`、`contextPressure`、`contextBreakdown`、`sessionStats`、`goal`、`plan`…）里既**没有「当前模型」**，也**没有「模型可见的工具表」**。所以宿主半区干两件事——在 `system-prompt/assemble` 上只读观察出「这次请求用的是哪个模型」和「工具表构成」，并按观察到的模型下发对应费率。

**模型是自动归属的**，不需要配置：官方模型选择插件会在该 waterfall 里把 `provider`/`model` 写进 `assembled.variables`，所以在 `await next()` 之后观察就能拿到（这也正是官方那个监听器的写法）。匹配顺序是：行配置里的 `model`（显式覆盖）→ `provider/model` → 裸 `model`；三者都没命中就显示「费用不可估算」并告诉你缺哪个键，而不是猜一个模型。

```
GET /api/dsh-context-panel/state
→ { ok, panel: { compactRatio }, pricing: { priced, currency, model, tariff, rates, source }, mcp: { totalTools, mcpTools, mcpBytes, servers } | null }
```

- **只读、只回环、只 GET**：非 GET 返 405，非回环（`remoteAddress` 与 `Host` 头双重校验）返 403。
- **不读任何会话数据、不碰凭据、不接受请求体**：只返回本插件行 `config` 里的费率与面板参数，以及最近一次组装结果的**体积汇总**。
- 客户端在面板打开时取一次；取不到或没定价 → 显示「费用不可估算」，而不是编一个数字。
- 诊断是干净的：**四项全 `—`** = 端点没通；**不可估算但模型/时段有值** = 端点通了、只是该模型没定价。

### 配置

```yaml
- id: context-panel
  name: 'dsh-context-panel'
  config:
    currency: CNY                 # 默认 CNY
    model: deepseek-flash         # 可选：显式覆盖观察到的模型（不填就自动归属）
    compactRatio: 0.8             # 可选：压缩阈值比例，刻度与距压缩余量跟着它（默认 0.8）
    peakWindows: ["09:00-12:00", "14:00-18:00"]   # 北京时间；周末一律闲时
    pricing:                      # 你的条目会合并到内置表上
      deepseek-flash:
        peak:    { input: 2, cacheRead: 0.04, cacheWrite: 0, output: 8 }
        offpeak: { input: 1, cacheRead: 0.02, cacheWrite: 0, output: 4 }
      my-model:                   # 也支持平铺形式，任意时段同价
        { input: 1, cacheRead: 0.02, cacheWrite: 0, output: 4 }
```

单位是**每百万 token 的金额**，键名 `input / cacheRead / cacheWrite / output`（兼容 `uncachedInputPerMillion` 等长名）。四个键都可省略，缺的按 0 算。

### 诚实的边界

- 内置默认价取自 `dsh-token-usage-stats` 公开发布的默认值（`deepseek-flash` 与 `deepseek-v4-pro`，CNY，峰谷两档；`cacheWrite` 不在 DeepSeek 价目表内，为 0）。**价格会变，请按你自己的合同核对**——界面会把来源标成「内置默认（请核对）」或「行配置」，让你知道看到的是哪一种。
- 面板显示的是**估算值，不是供应商账单**，也不会阻止调用。
- 费用是**用单一模型的费率乘整会话的 token 桶**。`tokenUsage` 是整份持久日志的聚合，**没有模型维度**（token-meter 的原文：它携带 `uncachedInputTokens` / `outputTokens` / `cacheReadTokens` / `cacheWriteTokens`，不含模型），所以只要一个会话用过两个模型——你中途换过模型，或子智能体跑在别的模型上——**这一个数字就无法精确**，按会话分桶也解决不了；真正的解法需要按模型的用量数据，而公开投影不提供。缓解手段是面板**始终列出这个金额所用的是哪个模型**，对不上你能立刻看见。
- 模型归属取**最近一次组装请求**的观察值，是宿主级单一快照：并发会话之间会互相覆盖（上一条说的多模型问题在单会话内就已经存在，所以这不是主因，只是额外的一层）。
- 观察监听器显式注册为 `{ global: true }`。依据是 `dsh-scope` 的 `scopeTarget` 过滤规则原文：*无作用域标签的监听器全局准入；带标签的监听器只接受匹配键或其祖先键的事件（"events flow up the chain, never down"）*。本插件的行在 profile 全局层、本来就没有标签，因此断言这个选项等于把这个保证固化下来——即使将来这个 bundle 被挂进某个作用域，也仍然看得到每一次组装。
- MCP 卡片统计的是**组装后的工具表**（模型实际为之付费的那份），**不是**拦截 MCP 协议层的 `tools/list` 调用——本插件从不碰 MCP 客户端。它只在 `system-prompt/assemble` 上做只读观察，并且遵守该 waterfall 的稳定纪律：不掌控决策的监听器必须 `return next()`（观察逻辑整体包在 try/catch 里，绝不会打断模型请求）。
- 体积是字符数（`name + description + JSON.stringify(parameters)`），按工具对象缓存在 WeakMap 里，所以热路径上每个工具代只序列化一次；它是**体积**而不是分词后的 token 数。

## 兼容性

`peerDependencies` 声明 `@deepseek-ai/dsh-session` 与 `@deepseek-ai/dsh-session-projection` 为 `^0.2.0-rc.2`——这是宿主唯一会校验的字段（`evaluatePluginCompatibility` 只读 `@deepseek-ai/dsh*` 的 peer 范围；`engines` 与自定义字段运行时都不读）。针对 DSH `0.2.0-rc.2` 开发并验证。

harness 处于 developer preview，投影字段可能变化。字段缺失时面板降级显示 `—` 或提示，不会让会话头部崩掉。

## 自检

```sh
npm test
```

不需要浏览器：脚本桩掉 `window.__ModuleLoader__` 与最小 React，真跑模块工厂与 `apply`，把面板树渲染成文本后断言。覆盖范围：

- **客户端**：manifest 字段、slot 注册（名 / id / locale / order）、截图数字（`46%`、`455.3K / 1M`、`压缩线 80%`、`距压缩 344.7K`、`平均命中 87.0%`、`累计 tokens 945.3K`、`请求数 42`、`运行时间 4m56s`）、费用算式与两种币种/时段、MCP 卡片三态、多条降级路径（空会话、无窗口大小、无 `sessionStats`、已越压缩线、kit 不提供 props、无 locale 函数）。
- **主题 token**：把用到的每个 `--dsw-*` / `--dsh-scrollbar-*` 与 0.2.0 实际定义的 token 对照成断言。**token 拼错或改名不会报错，只会静默 fallback**，所以这里必须靠断言而不是靠眼睛。
- **词条覆盖**：双向检查——组件调用的每个键在中英字典里都存在（缺键会在界面上显示成原始键名），且字典里没有没人调用的死键。
- **宿主半区**：峰谷判定（含周末）、费率解析与模型归属优先级、畸形配置回退、工具表汇总（含循环引用 schema 不抛错）、以及**直接驱动路由 handler**：回环 GET 得到 `{ok, pricing, mcp}`、非 GET 返 405、非回环与伪造 `Host` 头返 403、IPv4-mapped 回环放行。

发布内容：`npm pack --dry-run` 只包含 10 个文件（README、CHANGELOG、LICENSE、client.js、cordis.patch.yml、icon.svg、index.js、locale/en.json、locale/zh.json、package.json），`test/` 与 `RELEASING.md` 不进包。

### 运行时验证（不需要浏览器）

Host 通过 SSE 通道公布客户端模块图，并逐个提供客户端 bundle；两者都不需要浏览器的会话，所以可以直接向运行中的 Host 取证：

```sh
npm run test:runtime
```

它做三件事：读 `/plugins/events` 拿到当前图；确认本插件在图中且它 `inject` 的每个服务都在；再取回 Host 提供的本插件模块，断言它与仓库里的 `client.js` **逐字节相同**（Host 只在末尾追加自己的 sourcemap 注释）。这个脚本默认打 `http://127.0.0.1:19387`，可以传参换端口：

```sh
node test/runtime-graph.mjs dsh-context-panel http://127.0.0.1:3080
```

改完源码后是否需要重启（实测）：只改 `client.js` 时，图里的 `rev` 会随内容变化（实测 `430f392ba58e` → `f9a554504da5`），宿主随即提供新内容，**浏览器刷新即可，不需要重启**。改动 `cordis.patch.yml`、`package.json` 的 `dsh.bundle` / `dsh.client` 字段，或改动宿主半区，才需要重启 Harness 让新组合生效。

## 路线图

- [ ] 按模型拆分费用：这需要按模型的用量数据。`AssembleContext` 的第二个参数带 `scope?: ScopeKey`（`dsh-scope` 的路由作用域身份），可以按作用域分桶观察到的模型；但**公开投影的 `tokenUsage` 没有模型维度**，所以即使分了桶，也只能做到「按最近使用的模型计价」，做不到逐模型精确。真正需要的是带模型归属的用量来源。
- [ ] 为插件行声明 `Config` schema，让插件管理页能可视化编辑费率（当前从 profile 的 patch 里配置）。
- [ ] MCP 卡片的 token 估算：接入与平台一致的分词启发式，而不是只报体积。

## 许可

MIT
