# Changelog

## 0.1.0

首个版本，已在 DSH `0.2.0-rc.2` 的 desktop profile 上安装。

- 会话头部占用率圆环触发器 + 弹出面板（`conversation.session.header.actions`，order 25）。**鼠标移到触发器上打开、移开关闭**；浮层是触发器的子节点，所以指针移进面板不会关。触屏/键盘没有悬停可用，点击或回车照旧开关（判断抽成 `hoverDrivesPopover` / `clickTogglesPopover` 两个纯函数并有行为断言），键盘聚焦也会打开、Esc 关闭。
- 右侧栏常驻面板：浮层里的「在侧边栏打开」把面板停靠到对话旁边（`sidebar.right.pane.tab` + `.title`，keyed by 包名，注册一个 `keepMounted` 的 tab 类型）；停靠、标签切换、收起/最小化与关闭由宿主右侧栏坞提供。取数与推导抽成共享的 `usePanelProjections` / `useHostState` / `derivePanel`，两个界面共用同一套数字；右侧栏服务经 `ctx.inject` 条件注入，缺少右侧栏时头部浮层照常工作。
- 尺寸集中在 `--dcp-*` 变量上，两个界面各自声明一套：浮层 `.dcp-wrap`（宽 380px、正文 12px、数值 15px、间距 10px），停靠面板 `.dcp-pane`（同档，窄栏里不放大）。断言保证两套都存在、每个变量既被声明也被使用、停靠面板字号不大于浮层；每个宿主 token 都真实存在于 0.2.0 的 token 表。
- 上下文窗口：已用 / 窗口大小、占用比例、压缩线刻度（`compaction-basic` 默认 0.8）、距压缩余量、三档状态胶囊。
- 会话指标：KV 缓存命中率、累计 tokens、请求数、运行时间（模型 + 工具耗时）。
- 用量分析：上下文构成（系统提示 / 工具 / 消息）与 Token 构成（提示词 / 缓存读取 / 缓存写入 / 回复），各带堆叠条与图例。
- 模型自动归属：官方模型选择插件会把 `provider`/`model` 写进 `assembled.variables`，所以宿主半区在 `await next()` 之后只读观察就能拿到当前模型，**无需在配置里写死**。匹配顺序 `配置 model` → `provider/model` → `model`；都没命中就显示「费用不可估算」，并在提示里点明缺的是哪个键。
- 压缩阈值可配置：`compactRatio`（默认 0.8）由宿主下发，刻度位置、状态胶囊与「距压缩」余量都跟着它走；改过 `compaction-basic` 阈值的部署声明同一个数字即可对齐。
- 会话费用：宿主半区登记一个**只读、只回环、只 GET** 的端点 `GET /api/dsh-context-panel/state`，下发费率与当前时段（北京时间 09:00-12:00、14:00-18:00 为高峰，周末一律闲时）以及组装观察结果；客户端把四个 token 桶折成金额。未定价时显示「费用不可估算」。内置默认价取自 `dsh-token-usage-stats` 公开发布的默认值，界面会标注来源为「内置默认（请核对）」或「行配置」。端点不读会话数据、不碰凭据、不接受请求体。
- MCP 工具观察：宿主半区在 `system-prompt/assemble` 上做**只读**观察（遵守该 waterfall「不掌控决策必须 `return next()`」的纪律，观察逻辑整体 try/catch），汇总最近一次组装请求里 `mcp__<server>__<tool>` 的工具数、按服务器的 schema 体积，以及 MCP 占全部工具的比例。卡片有三态：尚未观察到组装结果 / 观察到了但本会话没有 MCP 工具（并报出工具总数，据此可判断观察器确实在跑）/ 按服务器列出 MCP 工具与体积。统计的是**组装后的工具表**，不是 MCP 协议层的 `tools/list` 调用。监听器显式注册 `{ global: true }`（依据 `dsh-scope` 的 `scopeTarget` 过滤规则：无标签监听器全局准入），保证任何作用域下的组装都被观察到。
- 明细表：上下文窗口、已用、下一次请求预测、构成合计、提示词、回复、命中率、模型耗时、工具耗时、首 token 平均耗时、生成速度、会话费用、计价模型、当前时段、费率来源。
- 双语字典（简体中文 / English）经 Client locale 服务注册；locale 文件提供插件卡片的标题与描述。
- 外观对齐宿主 0.2.0：弹层采用官方菜单材质（`--dsw-specific-menu` + `--dsw-menu-backdrop-filter` + `--dsw-elevation-prominent` + `--dsw-elevation-stroke-color`），圆角与卡片底色改用存在的 token（修复了两处引用了本 build 未定义的 `--dsw-alias-fill-l1` 与 `--dsw-font-mono`）。所有被引用的主题 token 均由测试对照 0.2.0 实际定义断言。
- 数据来源：面板数字全部来自官方会话投影（`tokenUsage`、`contextPressure`、`contextBreakdown`、`sessionStats`）——无 RPC、无落盘、不读凭据；唯一的网络调用是取费率，且只打回环地址。
- 降级：投影缺失时显示 `—` 或对应提示；kit 不再提供 `useProjection` 或 `t` 时降级到空状态，不会抛错让整个槽位变空白。
- `npm test`：无浏览器的 headless 校验（281 项断言），覆盖 manifest、slot 注册、渲染文本、费用算式、MCP 三态、降级路径、**主题 token 存在性**、**词条双向覆盖**，以及**直接驱动路由 handler** 的回环/方法围栏与载荷契约。`npm run test:runtime` 另向运行中的 Host 取证。

### 未包含（路线图）

- 逐模型精确计费：`tokenUsage` 投影是整份日志的聚合、不含模型维度，所以只要一个会话用过多个模型，单一金额就只能是「按某模型的费率估算」。面板会列出所用模型名。
- MCP 卡片的 token 估算（当前报体积而非分词数）。
- 行 `Config` schema（当前在 profile 的 patch 里配置费率与阈值；不声明 schema 是刻意选择——未校验的配置在这里会被防御性归一化，永远不会让整行激活失败）。
