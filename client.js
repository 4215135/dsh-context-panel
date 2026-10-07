/**
 * dsh-context-panel — browser half.
 *
 * One contribution: `conversation.session.header.actions`, a trigger that opens
 * a panel with the four blocks this plugin exists for:
 *
 *   1. 上下文窗口 — occupancy against the routed context window, the compaction
 *      threshold marker (compaction-basic's default 0.8), and the distance to it.
 *   2. 会话指标 — average KV-cache hit rate, cumulative tokens, closed steps and
 *      model+tool wall time.
 *   3. 用量分析 — the context composition of the next request (system / tools /
 *      messages) and the session's token composition (uncached / cache read /
 *      cache write / output), each with a detail table.
 *
 * Every figure is read from official session projections through the slot kit's
 * `useProjection`, exactly like the platform's own chat statistics: no RPC, no
 * HTTP endpoint, no persisted state, no credentials, no network.
 */
window.__ModuleLoader__.load({
  id: "dsh-context-panel",
  factory: (require) => {
    const React = require("react");
    const h = React.createElement;

    /** Locale namespace; the slot registration passes it so the kit supplies `t`. */
    const NS = "dsh-context-panel";
    /** The docked sidebar tab's kind — this type's identity in the tab system. */
    const PANEL_KIND = "context-panel";
    /** The key the pane body and its tab title register under (one pane per kind). */
    const PANEL_ID = "dsh-context-panel";
    /**
     * Compaction ratio assumed until the host answers. `@deepseek-ai/dsh-compaction-basic`
     * defaults to 0.8 of the routed context window; a deployment that changes it states
     * the same number in this plugin row's config and the host serves it back.
     */
    const FALLBACK_COMPACT_RATIO = 0.8;

    const zh = {
      "trigger.title": "上下文面板",
      "trigger.titleEmpty": "上下文",
      "panel.title": "上下文面板",
      "panel.empty": "本会话还没有请求。发一条消息后这里会显示上下文与用量。",
      "panel.partial": "部分统计不可用：当前组合没有提供对应的会话投影。",

      "window.title": "上下文窗口",
      "window.used": "已用",
      "window.of": "{used} / {total}",
      "window.distance": "距压缩",
      "window.over": "已超过压缩线",
      "window.threshold": "压缩线 {pct}%",
      "window.noWindow": "当前路由没有报告上下文窗口大小。",

      "status.healthy": "上下文充足",
      "status.watch": "即将压缩",
      "status.over": "已达压缩阈值",

      "metrics.title": "会话指标",
      "metrics.hit": "平均命中",
      "metrics.hitTitle": "本会话累计 KV 缓存命中率 = 缓存读取 / 全部提示词",
      "metrics.total": "累计 tokens",
      "metrics.totalTitle": "本会话累计提示词 + 回复",
      "metrics.steps": "请求数",
      "metrics.stepsTitle": "已闭合的步骤数（含完成、失败、取消与 max-tokens）",
      "metrics.runtime": "运行时间",
      "metrics.runtimeTitle": "模型耗时 + 工具耗时",
      "metrics.none": "—",

      "cost.title": "会话费用",
      "cost.unknown": "费用不可估算",
      "cost.model": "计价模型",
      "cost.tariff": "当前时段",
      "cost.peak": "高峰期",
      "cost.offpeak": "闲时",
      "cost.source": "费率来源",
      "cost.sourceConfig": "行配置",
      "cost.sourceBuiltin": "内置默认（请核对）",
      "cost.note": "按宿主下发的费率估算，不是供应商账单；整会话的 token 桶按单一模型的费率计算，中途换过模型则不精确。",
      "cost.reasonNoModel": "还没有观察到模型；发一条消息后即可估算",
      "cost.reasonNotPriced": "费率表里没有 {model}；请在插件行的配置里补上",

      "mcp.title": "MCP 工具",
      "mcp.pending": "本次会话还没有观察到组装结果",
      "mcp.none": "本会话没有 MCP 工具（共 {total} 个工具）",
      "mcp.note": "按最近一次请求的组装结果统计",
      "mcp.summary": "{mcp} / {total} 个工具来自 MCP",
      "mcp.count": "{n} 个工具",
      "mcp.weight": "MCP schema 占 {mcp} / 全部 {total}",

      "sidebar.title": "上下文面板",
      "sidebar.open": "在侧边栏打开",

      "usage.title": "用量分析",
      "usage.context": "上下文构成",
      "usage.contextNote": "下一次请求的估算构成",
      "usage.tokens": "Token 构成",
      "usage.tokensNote": "本会话累计",
      "usage.detail": "明细",
      "usage.empty": "本期没有可拆分的用量。",

      "part.system": "系统提示",
      "part.tools": "工具",
      "part.messages": "消息",
      "part.uncached": "提示词",
      "part.cacheRead": "缓存读取",
      "part.cacheWrite": "缓存写入",
      "part.output": "回复",

      "detail.metric": "指标",
      "detail.value": "数值",
      "detail.contextWindow": "上下文窗口",
      "detail.used": "已用（输入侧）",
      "detail.projected": "下一次请求预测",
      "detail.composition": "上下文构成合计",
      "detail.prompt": "提示词（未缓存 + 缓存读 + 缓存写）",
      "detail.output": "回复",
      "detail.hit": "缓存命中率",
      "detail.llm": "模型耗时",
      "detail.tool": "工具耗时",
      "detail.ttft": "首 token 平均耗时",
      "detail.decode": "生成速度",
    };

    const en = {
      "trigger.title": "Context panel",
      "trigger.titleEmpty": "Context",
      "panel.title": "Context panel",
      "panel.empty": "No request in this session yet. Send a message and the context and usage figures appear here.",
      "panel.partial": "Some figures are unavailable: this composition provides no matching session projection.",

      "window.title": "Context window",
      "window.used": "Used",
      "window.of": "{used} / {total}",
      "window.distance": "To compaction",
      "window.over": "Past the compaction line",
      "window.threshold": "compact {pct}%",
      "window.noWindow": "The routed model reports no context-window size.",

      "status.healthy": "Context healthy",
      "status.watch": "Compaction soon",
      "status.over": "Compaction threshold",

      "metrics.title": "Session metrics",
      "metrics.hit": "Avg cache hit",
      "metrics.hitTitle": "Session KV-cache hit rate = cache reads / all prompt tokens",
      "metrics.total": "Total tokens",
      "metrics.totalTitle": "Session prompt + reply tokens",
      "metrics.steps": "Requests",
      "metrics.stepsTitle": "Closed steps, including completed, failed, cancelled and max-tokens steps",
      "metrics.runtime": "Runtime",
      "metrics.runtimeTitle": "Model wall time + tool wall time",
      "metrics.none": "—",

      "cost.title": "Session cost",
      "cost.unknown": "Cost not estimable",
      "cost.model": "Priced model",
      "cost.tariff": "Tariff now",
      "cost.peak": "Peak",
      "cost.offpeak": "Off-peak",
      "cost.source": "Rate source",
      "cost.sourceConfig": "row config",
      "cost.sourceBuiltin": "built-in defaults (verify)",
      "cost.note": "Estimated from the rates the Host reports; not a provider invoice. The whole session's buckets are priced with one model, so switching models mid-session makes it inexact.",
      "cost.reasonNoModel": "No model observed yet; send a message and the estimate appears",
      "cost.reasonNotPriced": "The rate table has no {model}; add it in the plugin row config",

      "mcp.title": "MCP tools",
      "mcp.pending": "No assembled request observed yet",
      "mcp.none": "No MCP tools in this session ({total} tools total)",
      "mcp.note": "from the last assembled request",
      "mcp.summary": "{mcp} / {total} tools come from MCP",
      "mcp.count": "{n} tools",
      "mcp.weight": "MCP schemas weigh {mcp} of {total}",

      "sidebar.title": "Context panel",
      "sidebar.open": "Open in sidebar",

      "usage.title": "Usage analysis",
      "usage.context": "Context composition",
      "usage.contextNote": "estimated for the next request",
      "usage.tokens": "Token composition",
      "usage.tokensNote": "session cumulative",
      "usage.detail": "Details",
      "usage.empty": "Nothing to break down yet.",

      "part.system": "System",
      "part.tools": "Tools",
      "part.messages": "Messages",
      "part.uncached": "Prompt",
      "part.cacheRead": "Cache read",
      "part.cacheWrite": "Cache write",
      "part.output": "Reply",

      "detail.metric": "Metric",
      "detail.value": "Value",
      "detail.contextWindow": "Context window",
      "detail.used": "Used (input side)",
      "detail.projected": "Next request (projected)",
      "detail.composition": "Context composition total",
      "detail.prompt": "Prompt (uncached + cache read + cache write)",
      "detail.output": "Reply",
      "detail.hit": "Cache hit rate",
      "detail.llm": "Model wall time",
      "detail.tool": "Tool wall time",
      "detail.ttft": "Average first-token latency",
      "detail.decode": "Decode speed",
    };

    /** 58123 → "58.1K", 1000000 → "1M", 1234567 → "1.23M". */
    function fmt(n) {
      if (typeof n !== "number" || !Number.isFinite(n)) return "—";
      const trim = (text) => text.replace(/\.?0+$/, "");
      if (Math.abs(n) >= 1e6) return `${trim((n / 1e6).toFixed(2))}M`;
      if (Math.abs(n) >= 1e3) return `${trim((n / 1e3).toFixed(1))}K`;
      return String(Math.round(n));
    }

    /** 83000 → "1m23s", 4200 → "4.2s", 380 → "380ms". */
    function fmtMs(ms) {
      if (typeof ms !== "number" || !Number.isFinite(ms) || ms <= 0) return "—";
      if (ms < 1000) return `${Math.round(ms)}ms`;
      if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
      const total = Math.round(ms / 1000);
      const m = Math.floor(total / 60);
      const s = total % 60;
      if (m < 60) return `${m}m${String(s).padStart(2, "0")}s`;
      return `${Math.floor(m / 60)}h${String(m % 60).padStart(2, "0")}m`;
    }

    /** Filled-ratio percentage for one bar segment; 0 when the part is empty. */
    function pct(part, total) {
      if (!total || !part || part <= 0) return 0;
      return Math.min(100, Math.max(0, (100 * part) / total));
    }

    /** 0.734 → "73.4%"; undefined stays undefined so callers can print "—". */
    function pctText(ratio) {
      if (typeof ratio !== "number" || !Number.isFinite(ratio)) return undefined;
      return `${(100 * ratio).toFixed(1)}%`;
    }

    /** 12345 → "12.3KB"; used for schema weights observed on the assemble path. */
    function fmtBytes(bytes) {
      if (typeof bytes !== "number" || !Number.isFinite(bytes)) return "—";
      if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(2)}MB`;
      if (bytes >= 1024) return `${(bytes / 1024).toFixed(1)}KB`;
      return `${Math.round(bytes)}B`;
    }

    /**
     * Popover policy, as pure predicates so the rule is testable without a DOM.
     *
     * A mouse drives the popover by hovering — enter opens, leave closes — so a mouse
     * click must not toggle what hover already decided. Every other pointer (touch,
     * pen) and keyboard activation has no hover to rely on, so it toggles as before.
     */
    function hoverDrivesPopover(pointerType) {
      return pointerType === "mouse";
    }

    /** Whether a click should toggle the popover for this pointer kind. */
    function clickTogglesPopover(pointerType) {
      return !hoverDrivesPopover(pointerType);
    }

    /** Money in the host's currency; sub-unit amounts keep four decimals. */
    function formatMoney(value, currency) {
      if (typeof value !== "number" || !Number.isFinite(value)) return undefined;
      const symbol = currency === "CNY" ? "¥" : currency === "USD" ? "$" : `${currency} `;
      return `${symbol}${value.toFixed(Math.abs(value) < 1 ? 4 : 2)}`;
    }

    /**
     * Session cost from the cumulative token buckets at the rates the host
     * reported (rates are per million tokens, hence the 1e6 divisor).
     * @param rates - { input, cacheRead, cacheWrite, output }.
     * @param tokens - { uncached, cacheRead, cacheWrite, output }.
     */
    function sessionCost(rates, tokens) {
      return (
        (tokens.uncached * rates.input +
          tokens.cacheRead * rates.cacheRead +
          tokens.cacheWrite * rates.cacheWrite +
          tokens.output * rates.output) /
        1e6
      );
    }

    /** Occupancy ring for the trigger; `value` is a 0-100 percentage or undefined. */
    function Ring(props) {
      const r = 7;
      const c = 2 * Math.PI * r;
      const value = typeof props.value === "number" ? Math.min(100, Math.max(0, props.value)) : 0;
      return h(
        "svg",
        { className: "dcp-ring", viewBox: "0 0 18 18", width: 18, height: 18, "aria-hidden": true },
        h("circle", { className: "dcp-ring-bg", cx: 9, cy: 9, r }),
        h("circle", {
          className: "dcp-ring-fg",
          cx: 9,
          cy: 9,
          r,
          strokeDasharray: `${(value / 100) * c} ${c}`,
          transform: "rotate(-90 9 9)",
        }),
      );
    }

    /** One horizontal composition bar plus its legend rows. */
    function Breakdown(props) {
      const { t, total, rows, unit } = props;
      if (!total || total <= 0) {
        return h("p", { className: "dcp-note" }, t("usage.empty"));
      }
      return h(
        "div",
        { className: "dcp-bd" },
        h(
          "div",
          { className: "dcp-bd-track", role: "img", "aria-label": fmt(total) },
          rows.map((row) =>
            h("span", {
              key: row.key,
              className: `dcp-bd-seg dcp-seg-${row.key}`,
              style: { width: `${pct(row.value, total)}%` },
              title: `${row.label} ${fmt(row.value)}`,
            }),
          ),
        ),
        h(
          "ul",
          { className: "dcp-bd-legend" },
          rows.map((row) =>
            h(
              "li",
              { key: row.key, className: "dcp-bd-item" },
              h("span", { className: `dcp-dot dcp-seg-${row.key}` }),
              h("span", { className: "dcp-bd-label", title: row.label }, row.label),
              h("span", { className: "dcp-bd-value" }, unit === "pct" ? pctText(row.share) ?? "—" : fmt(row.value)),
            ),
          ),
        ),
      );
    }

    /** Metric tile used by the session-metrics grid. */
    function Metric(props) {
      return h(
        "div",
        { className: `dcp-metric${props.wide === true ? " dcp-metric-wide" : ""}`, title: props.title },
        h("span", { className: "dcp-metric-label" }, props.label),
        h("span", { className: "dcp-metric-value" }, props.value),
      );
    }

    /**
     * The header trigger and its popover panel.
     *
     * The session scope's builtin source supplies `sessionId`, the `useSession`
     * hook and the keyed `projection` hook, and the registration's `locale`
     * option supplies `t`. Both are read defensively: a kit that stops supplying
     * one of them must degrade this panel to its empty state, never throw, since
     * a throwing component blanks its whole slot entry.
     *
     * @param props - session standard kit + locale `t`.
     */
    /**
     * The four official projections, read defensively: `sessionStats` ships only
     * when @deepseek-ai/dsh-session-stats is composed.
     */
    function usePanelProjections(useProjection) {
      const usage = useProjection("tokenUsage");
      const pressure = useProjection("contextPressure");
      const breakdown = useProjection("contextBreakdown");
      // A missing unit must degrade a surface, not blank it.
      let stats;
      try {
        stats = useProjection("sessionStats");
      } catch {
        stats = undefined;
      }
      return { usage, pressure, breakdown, stats };
    }

    /**
     * The two inputs that cannot come from a projection — the tariff and the last
     * assembled tool summary — fetched from the host half (loopback-only, GET-only)
     * while `active`. Any failure leaves the cost row at "not estimable" rather than
     * wrong, and a response that lands after unmount is dropped.
     */
    function useHostState(active) {
      const [hostState, setHostState] = React.useState(null);
      React.useEffect(() => {
        if (!active || typeof fetch !== "function") return undefined;
        let cancelled = false;
        fetch("/api/dsh-context-panel/state", { headers: { accept: "application/json" } })
          .then((response) => (response.ok ? response.json() : undefined))
          .then((payload) => {
            if (!cancelled && payload !== undefined && payload.ok === true) setHostState(payload);
          })
          .catch(() => {});
        return () => {
          cancelled = true;
        };
      }, [active]);
      return hostState;
    }

    /**
     * Every figure a surface shows, derived once from the projections and the host
     * payload. The header popover and the sidebar pane both render this object, so a
     * formula or a label exists in exactly one place.
     */
    function derivePanel({ usage, pressure, breakdown, stats, hostState, t }) {
      const tariff = hostState?.pricing;
      const mcp = hostState?.mcp ?? null;
      const compactRatio =
        typeof hostState?.panel?.compactRatio === "number" ? hostState.panel.compactRatio : FALLBACK_COMPACT_RATIO;
      // ---- context window ----
      const windowSize = pressure?.contextWindow;
      const used = pressure?.pressureTokens;
      const usedRatio = typeof windowSize === "number" && windowSize > 0 && typeof used === "number" ? used / windowSize : undefined;
      const thresholdTokens = typeof windowSize === "number" && windowSize > 0 ? windowSize * compactRatio : undefined;
      const distance =
        typeof thresholdTokens === "number" && typeof used === "number" ? thresholdTokens - used : undefined;
      const status =
        usedRatio === undefined
          ? undefined
          : usedRatio >= 1
            ? t("status.over")
            : usedRatio >= compactRatio
              ? t("status.watch")
              : t("status.healthy");
      const statusTone =
        usedRatio === undefined ? "idle" : usedRatio >= 1 ? "over" : usedRatio >= compactRatio ? "watch" : "ok";

      // ---- session metrics ----
      const uncached = usage?.uncachedInputTokens ?? 0;
      const cacheRead = usage?.cacheReadTokens ?? 0;
      const cacheWrite = usage?.cacheWriteTokens ?? 0;
      const output = usage?.outputTokens ?? 0;
      const promptTokens = uncached + cacheRead + cacheWrite;
      const totalTokens = promptTokens + output;
      const hitRatio = promptTokens > 0 ? cacheRead / promptTokens : undefined;
      const runtimeMs = (stats?.llmMs ?? 0) + (stats?.toolMs ?? 0);
      const decodeSpeed =
        typeof stats?.decodeTokens === "number" && typeof stats?.decodeMs === "number" && stats.decodeMs > 0
          ? stats.decodeTokens / (stats.decodeMs / 1000)
          : undefined;

      // ---- cost (host-reported tariff) ----
      const costValue =
        tariff?.priced === true && tariff.rates !== undefined
          ? sessionCost(tariff.rates, { uncached, cacheRead, cacheWrite, output })
          : undefined;
      const costText = costValue === undefined ? undefined : formatMoney(costValue, tariff.currency);
      // The tariff is reported even for an unpriced model, so the detail rows can
      // distinguish "the Host answered but has no rate for this model" (model and
      // tariff shown, no source) from "the Host never answered" (everything blank).
      const tariffText =
        typeof tariff?.tariff === "string" ? (tariff.tariff === "peak" ? t("cost.peak") : t("cost.offpeak")) : undefined;
      const rateSourceText =
        tariff?.priced === true
          ? tariff.source === "config"
            ? t("cost.sourceConfig")
            : t("cost.sourceBuiltin")
          : undefined;
      // When there is no number, the tile's tooltip explains which of the two
      // reasons applies, so "not estimable" is never a dead end.
      const costTitle =
        costText !== undefined
          ? t("cost.note")
          : tariff?.reason === "no-model-observed"
            ? t("cost.reasonNoModel")
            : tariff?.reason === "model-not-priced"
              ? t("cost.reasonNotPriced", { model: tariff.model ?? "?" })
              : t("cost.note");

      // ---- compositions ----
      const systemTokens = breakdown?.systemTokens ?? 0;
      const toolsTokens = breakdown?.toolsTokens ?? 0;
      const messageTokens = breakdown?.messageTokens ?? 0;
      const compositionTotal = systemTokens + toolsTokens + messageTokens;

      const hasAny = usage !== undefined || pressure !== undefined || breakdown !== undefined || stats !== undefined;
      const partial = hasAny && (usage === undefined || pressure === undefined);

      const triggerText = usedRatio !== undefined ? `${Math.round(100 * usedRatio)}%` : t("trigger.titleEmpty");

      const contextRows = [
        { key: "system", label: t("part.system"), value: systemTokens },
        { key: "tools", label: t("part.tools"), value: toolsTokens },
        { key: "messages", label: t("part.messages"), value: messageTokens },
      ];
      const tokenRows = [
        { key: "uncached", label: t("part.uncached"), value: uncached },
        { key: "cacheRead", label: t("part.cacheRead"), value: cacheRead },
        { key: "cacheWrite", label: t("part.cacheWrite"), value: cacheWrite },
        { key: "output", label: t("part.output"), value: output },
      ].map((row) => ({ ...row, share: totalTokens > 0 ? row.value / totalTokens : 0 }));

      const detailRows = [
        [t("detail.contextWindow"), fmt(windowSize)],
        [t("detail.used"), fmt(used)],
        [t("detail.projected"), fmt(pressure?.projectedTokens)],
        [t("detail.composition"), fmt(compositionTotal)],
        [t("detail.prompt"), fmt(promptTokens)],
        [t("detail.output"), fmt(output)],
        [t("detail.hit"), pctText(hitRatio) ?? "—"],
        [t("detail.llm"), fmtMs(stats?.llmMs)],
        [t("detail.tool"), fmtMs(stats?.toolMs)],
        [
          t("detail.ttft"),
          typeof stats?.ttftMs === "number" && stats?.ttftSteps > 0 ? fmtMs(stats.ttftMs / stats.ttftSteps) : "—",
        ],
        [t("detail.decode"), decodeSpeed !== undefined ? `${decodeSpeed.toFixed(1)} tok/s` : "—"],
        [t("cost.title"), costText ?? t("cost.unknown")],
        [t("cost.model"), tariff?.model ?? "—"],
        [t("cost.tariff"), tariffText ?? "—"],
        [t("cost.source"), rateSourceText ?? "—"],
      ];

      return {
        tariff,
        mcp,
        compactRatio,
        windowSize,
        used,
        usedRatio,
        thresholdTokens,
        distance,
        status,
        statusTone,
        uncached,
        cacheRead,
        cacheWrite,
        output,
        promptTokens,
        totalTokens,
        hitRatio,
        runtimeMs,
        decodeSpeed,
        costValue,
        costText,
        tariffText,
        rateSourceText,
        costTitle,
        systemTokens,
        toolsTokens,
        messageTokens,
        compositionTotal,
        hasAny,
        partial,
        triggerText,
        contextRows,
        tokenRows,
        detailRows,
      };
    }

    function Panel(props) {
      const t = typeof props.t === "function" ? props.t : (key) => key;
      const useProjection = typeof props.useProjection === "function" ? props.useProjection : () => undefined;
      const openInSidebar = props.openInSidebar;
      const { usage, pressure, breakdown, stats } = usePanelProjections(useProjection);
      const [open, setOpen] = React.useState(false);
      const [detail, setDetail] = React.useState(false);
      const hostState = useHostState(open);
      const rootRef = React.useRef(null);
      /** The pointer kind of the last hover, so a mouse click does not re-toggle. */
      const pointerRef = React.useRef(null);

      React.useEffect(() => {
        if (!open) return undefined;
        const close = (event) => {
          if (event.target instanceof Node && !rootRef.current?.contains(event.target)) setOpen(false);
        };
        const escape = (event) => {
          if (event.key === "Escape") setOpen(false);
        };
        document.addEventListener("pointerdown", close);
        document.addEventListener("keydown", escape);
        return () => {
          document.removeEventListener("pointerdown", close);
          document.removeEventListener("keydown", escape);
        };
      }, [open]);

      const data = derivePanel({ usage, pressure, breakdown, stats, hostState, t });
      const { tariff, mcp, compactRatio, windowSize, used, usedRatio, thresholdTokens, distance, status, statusTone, uncached, cacheRead, cacheWrite, output, promptTokens, totalTokens, hitRatio, runtimeMs, decodeSpeed, costValue, costText, tariffText, rateSourceText, costTitle, systemTokens, toolsTokens, messageTokens, compositionTotal, hasAny, partial, triggerText, contextRows, tokenRows, detailRows } = data;

      return h(
        "div",
        {
          className: "dcp-wrap",
          ref: rootRef,
          // The popover is a child of this wrapper, so moving the pointer from the
          // trigger into the panel keeps the wrapper hovered and does not close it.
          onPointerEnter: (event) => {
            pointerRef.current = event.pointerType ?? null;
            if (hoverDrivesPopover(event.pointerType)) setOpen(true);
          },
          onPointerLeave: (event) => {
            if (hoverDrivesPopover(event.pointerType)) setOpen(false);
          },
        },
        h(
          "button",
          {
            type: "button",
            className: "dcp-trigger",
            "data-open": open || undefined,
            "aria-haspopup": "dialog",
            "aria-expanded": open,
            title: t("trigger.title"),
            // Keyboard focus opens too, so the popover is reachable without a pointer;
            // Escape (below) closes it for those users.
            onFocus: () => setOpen(true),
            onClick: () => {
              if (clickTogglesPopover(pointerRef.current)) setOpen((value) => !value);
            },
          },
          h(Ring, { value: usedRatio !== undefined ? usedRatio * 100 : undefined }),
          h("span", { className: "dcp-trigger-text" }, triggerText),
        ),
        open &&
          h(
            "div",
            { className: "dcp-panel", role: "dialog", "aria-label": t("panel.title") },
            h(
              "header",
              { className: "dcp-head" },
              h("span", { className: "dcp-title" }, t("panel.title")),
              h(
                "div",
                { className: "dcp-head-actions" },
                typeof openInSidebar === "function" &&
                  h(
                    "button",
                    {
                      type: "button",
                      className: "dcp-iconbtn",
                      title: t("sidebar.open"),
                      onClick: () => openInSidebar(),
                    },
                    t("sidebar.open"),
                  ),
                h(
                  "button",
                  {
                    type: "button",
                    className: "dcp-iconbtn",
                    "aria-label": t("usage.detail"),
                    "data-active": detail || undefined,
                    onClick: () => setDetail((value) => !value),
                  },
                  t("usage.detail"),
                ),
              ),
            ),
            h(
              "div",
              { className: "dcp-body" },
              !hasAny && h("p", { className: "dcp-note" }, t("panel.empty")),
              partial && h("p", { className: "dcp-note" }, t("panel.partial")),

              // ---- 1. context window ----
              hasAny &&
                h(
                  "section",
                  { className: "dcp-card" },
                  h(
                    "div",
                    { className: "dcp-card-head" },
                    h("span", { className: "dcp-card-title" }, t("window.title")),
                    status && h("span", { className: `dcp-pill dcp-pill-${statusTone}` }, status),
                  ),
                  typeof windowSize === "number" && windowSize > 0
                    ? h(
                        "div",
                        { className: "dcp-win" },
                        h(
                          "div",
                          { className: "dcp-win-head" },
                          h("span", { className: "dcp-win-used" }, t("window.used")),
                          h(
                            "span",
                            { className: "dcp-win-of" },
                            t("window.of", { used: fmt(used), total: fmt(windowSize) }),
                          ),
                        ),
                        h(
                          "div",
                          { className: "dcp-track", role: "img", "aria-label": pctText(usedRatio) ?? "" },
                          h("span", {
                            className: `dcp-fill dcp-fill-${statusTone}`,
                            style: { width: `${usedRatio !== undefined ? Math.min(100, usedRatio * 100) : 0}%` },
                          }),
                          h("span", { className: "dcp-mark", style: { left: `${compactRatio * 100}%` } }),
                          h(
                            "span",
                            { className: "dcp-mark-label", style: { left: `${compactRatio * 100}%` } },
                            t("window.threshold", { pct: Math.round(compactRatio * 100) }),
                          ),
                        ),
                        h(
                          "div",
                          { className: "dcp-win-foot" },
                          h("span", null, pctText(usedRatio) ?? "—"),
                          h(
                            "span",
                            { className: distance !== undefined && distance < 0 ? "dcp-over" : undefined },
                            distance !== undefined && distance < 0
                              ? t("window.over")
                              : `${t("window.distance")} ${fmt(distance)}`,
                          ),
                        ),
                      )
                    : h("p", { className: "dcp-note" }, t("window.noWindow")),
                ),

              // ---- 2. MCP tools observed on the assemble path ----
              hasAny &&
                h(
                  "section",
                  { className: "dcp-card" },
                  h("div", { className: "dcp-card-head" }, h("span", { className: "dcp-card-title" }, t("mcp.title"))),
                  mcp === null
                    ? h("p", { className: "dcp-note" }, t("mcp.pending"))
                    : mcp.mcpTools === 0
                      ? h("p", { className: "dcp-note" }, t("mcp.none", { total: mcp.totalTools }))
                      : h(
                        "div",
                        { className: "dcp-sub" },
                        h(
                          "div",
                          { className: "dcp-sub-head" },
                          h(
                            "span",
                            { className: "dcp-sub-title" },
                            t("mcp.summary", { mcp: mcp.mcpTools, total: mcp.totalTools }),
                          ),
                          h("span", { className: "dcp-sub-note" }, t("mcp.note")),
                        ),
                        h(
                          "ul",
                          { className: "dcp-mcp" },
                          mcp.servers.map((row) =>
                            h(
                              "li",
                              { key: row.server, className: "dcp-mcp-item" },
                              h("span", { className: "dcp-mcp-name", title: row.server }, row.server),
                              h("span", { className: "dcp-mcp-count" }, t("mcp.count", { n: row.tools })),
                              h("span", { className: "dcp-mcp-bytes" }, fmtBytes(row.bytes)),
                            ),
                          ),
                        ),
                        h("p", { className: "dcp-note" }, t("mcp.weight", { mcp: fmtBytes(mcp.mcpBytes), total: fmtBytes(mcp.totalBytes) })),
                      ),
                ),

              // ---- 3. session metrics ----
              hasAny &&
                h(
                  "section",
                  { className: "dcp-card" },
                  h("div", { className: "dcp-card-head" }, h("span", { className: "dcp-card-title" }, t("metrics.title"))),
                  h(
                    "div",
                    { className: "dcp-grid" },
                    h(Metric, {
                      label: t("metrics.hit"),
                      title: t("metrics.hitTitle"),
                      value: pctText(hitRatio) ?? t("metrics.none"),
                    }),
                    h(Metric, {
                      label: t("metrics.total"),
                      title: t("metrics.totalTitle"),
                      value: totalTokens > 0 ? fmt(totalTokens) : t("metrics.none"),
                    }),
                    h(Metric, {
                      label: t("metrics.steps"),
                      title: t("metrics.stepsTitle"),
                      value: typeof stats?.steps === "number" ? String(stats.steps) : t("metrics.none"),
                    }),
                    h(Metric, {
                      label: t("metrics.runtime"),
                      title: t("metrics.runtimeTitle"),
                      value: runtimeMs > 0 ? fmtMs(runtimeMs) : t("metrics.none"),
                    }),
                    h(Metric, {
                      label: t("cost.title"),
                      title: costTitle,
                      value: costText ?? t("cost.unknown"),
                      wide: true,
                    }),
                  ),
                ),

              // ---- 4. usage analysis ----              hasAny &&
                h(
                  "section",
                  { className: "dcp-card" },
                  h("div", { className: "dcp-card-head" }, h("span", { className: "dcp-card-title" }, t("usage.title"))),
                  h(
                    "div",
                    { className: "dcp-sub" },
                    h(
                      "div",
                      { className: "dcp-sub-head" },
                      h("span", { className: "dcp-sub-title" }, t("usage.context")),
                      h("span", { className: "dcp-sub-note" }, t("usage.contextNote")),
                    ),
                    h(Breakdown, { t, total: compositionTotal, rows: contextRows }),
                  ),
                  h(
                    "div",
                    { className: "dcp-sub" },
                    h(
                      "div",
                      { className: "dcp-sub-head" },
                      h("span", { className: "dcp-sub-title" }, t("usage.tokens")),
                      h("span", { className: "dcp-sub-note" }, t("usage.tokensNote")),
                    ),
                    h(Breakdown, { t, total: totalTokens, rows: tokenRows, unit: "pct" }),
                  ),
                  detail &&
                    h(
                      "table",
                      { className: "dcp-table" },
                      h(
                        "thead",
                        null,
                        h("tr", null, h("th", null, t("detail.metric")), h("th", null, t("detail.value"))),
                      ),
                      h(
                        "tbody",
                        null,
                        detailRows.map(([label, value]) => h("tr", { key: label }, h("td", null, label), h("td", null, value))),
                      ),
                    ),
                ),
            ),
          ),
      );
    }

    /**
     * The sidebar surface: a full-height column the user can dock, collapse and
     * return to, rendered beside the conversation instead of over it. The dock owns
     * the tab chrome, the width and the collapse control, so this renders only the
     * cards — arranged for a tall column (single column of cards, details always
     * visible, no popover chrome). Every figure comes from the same `derivePanel` the
     * header popover uses, so a number cannot drift between the two surfaces.
     */
    function SidebarPane(props) {
      const t = typeof props.t === "function" ? props.t : (key) => key;
      const useProjection = typeof props.useProjection === "function" ? props.useProjection : () => undefined;
      const { usage, pressure, breakdown, stats } = usePanelProjections(useProjection);
      const hostState = useHostState(true);
      const data = derivePanel({ usage, pressure, breakdown, stats, hostState, t });
      const {
        windowSize,
        used,
        usedRatio,
        status,
        statusTone,
        distance,
        compactRatio,
        hitRatio,
        totalTokens,
        runtimeMs,
        costText,
        costTitle,
        mcp,
        contextRows,
        tokenRows,
        detailRows,
        compositionTotal,
        hasAny,
        partial,
      } = data;
      const none = t("metrics.none");
      const fillWidth = `${usedRatio !== undefined ? Math.min(100, usedRatio * 100) : 0}%`;
      const markLeft = `${compactRatio * 100}%`;
      return h(
        "div",
        { className: "dcp-pane" },
        !hasAny && h("p", { className: "dcp-note" }, t("panel.empty")),
        partial && h("p", { className: "dcp-note" }, t("panel.partial")),

        h(
          "section",
          { className: "dcp-card" },
          h(
            "div",
            { className: "dcp-card-head" },
            h("span", { className: "dcp-card-title" }, t("window.title")),
            status && h("span", { className: `dcp-pill dcp-pill-${statusTone}` }, status),
          ),
          typeof windowSize === "number" && windowSize > 0
            ? h(
                "div",
                { className: "dcp-win" },
                h(
                  "div",
                  { className: "dcp-win-head" },
                  h("span", { className: "dcp-win-used" }, t("window.used")),
                  h("span", { className: "dcp-win-of" }, t("window.of", { used: fmt(used), total: fmt(windowSize) })),
                ),
                h(
                  "div",
                  { className: "dcp-track", role: "img", "aria-label": pctText(usedRatio) ?? "" },
                  h("span", { className: `dcp-fill dcp-fill-${statusTone}`, style: { width: fillWidth } }),
                  h("span", { className: "dcp-mark", style: { left: markLeft } }),
                  h(
                    "span",
                    { className: "dcp-mark-label", style: { left: markLeft } },
                    t("window.threshold", { pct: Math.round(compactRatio * 100) }),
                  ),
                ),
                h(
                  "div",
                  { className: "dcp-win-foot" },
                  h("span", null, pctText(usedRatio) ?? "—"),
                  h(
                    "span",
                    { className: distance !== undefined && distance < 0 ? "dcp-over" : undefined },
                    distance !== undefined && distance < 0
                      ? t("window.over")
                      : `${t("window.distance")} ${fmt(distance)}`,
                  ),
                ),
              )
            : h("p", { className: "dcp-note" }, t("window.noWindow")),
        ),

        h(
          "section",
          { className: "dcp-card" },
          h("div", { className: "dcp-card-head" }, h("span", { className: "dcp-card-title" }, t("metrics.title"))),
          h(
            "div",
            { className: "dcp-grid" },
            h(Metric, { label: t("metrics.hit"), title: t("metrics.hitTitle"), value: pctText(hitRatio) ?? none }),
            h(Metric, {
              label: t("metrics.total"),
              title: t("metrics.totalTitle"),
              value: totalTokens > 0 ? fmt(totalTokens) : none,
            }),
            h(Metric, {
              label: t("metrics.steps"),
              title: t("metrics.stepsTitle"),
              value: typeof stats?.steps === "number" ? String(stats.steps) : none,
            }),
            h(Metric, {
              label: t("metrics.runtime"),
              title: t("metrics.runtimeTitle"),
              value: runtimeMs > 0 ? fmtMs(runtimeMs) : none,
            }),
            h(Metric, { label: t("cost.title"), title: costTitle, value: costText ?? t("cost.unknown"), wide: true }),
          ),
        ),

        h(
          "section",
          { className: "dcp-card" },
          h("div", { className: "dcp-card-head" }, h("span", { className: "dcp-card-title" }, t("mcp.title"))),
          mcp === null
            ? h("p", { className: "dcp-note" }, t("mcp.pending"))
            : mcp.mcpTools === 0
              ? h("p", { className: "dcp-note" }, t("mcp.none", { total: mcp.totalTools }))
              : h(
                  "div",
                  { className: "dcp-sub" },
                  h(
                    "div",
                    { className: "dcp-sub-head" },
                    h(
                      "span",
                      { className: "dcp-sub-title" },
                      t("mcp.summary", { mcp: mcp.mcpTools, total: mcp.totalTools }),
                    ),
                    h("span", { className: "dcp-sub-note" }, t("mcp.note")),
                  ),
                  h(
                    "ul",
                    { className: "dcp-mcp" },
                    mcp.servers.map((row) =>
                      h(
                        "li",
                        { key: row.server, className: "dcp-mcp-item" },
                        h("span", { className: "dcp-mcp-name", title: row.server }, row.server),
                        h("span", { className: "dcp-mcp-count" }, t("mcp.count", { n: row.tools })),
                        h("span", { className: "dcp-mcp-bytes" }, fmtBytes(row.bytes)),
                      ),
                    ),
                  ),
                  h(
                    "p",
                    { className: "dcp-note" },
                    t("mcp.weight", { mcp: fmtBytes(mcp.mcpBytes), total: fmtBytes(mcp.totalBytes) }),
                  ),
                ),
        ),

        hasAny &&
          h(
            "section",
            { className: "dcp-card" },
            h("div", { className: "dcp-card-head" }, h("span", { className: "dcp-card-title" }, t("usage.title"))),
            h(
              "div",
              { className: "dcp-sub" },
              h(
                "div",
                { className: "dcp-sub-head" },
                h("span", { className: "dcp-sub-title" }, t("usage.context")),
                h("span", { className: "dcp-sub-note" }, t("usage.contextNote")),
              ),
              h(Breakdown, { t, total: compositionTotal, rows: contextRows }),
            ),
            h(
              "div",
              { className: "dcp-sub" },
              h(
                "div",
                { className: "dcp-sub-head" },
                h("span", { className: "dcp-sub-title" }, t("usage.tokens")),
                h("span", { className: "dcp-sub-note" }, t("usage.tokensNote")),
              ),
              h(Breakdown, { t, total: totalTokens, rows: tokenRows, unit: "pct" }),
            ),
            h(
              "table",
              { className: "dcp-table" },
              h("thead", null, h("tr", null, h("th", null, t("detail.metric")), h("th", null, t("detail.value")))),
              h(
                "tbody",
                null,
                detailRows.map(([label, value]) => h("tr", { key: label }, h("td", null, label), h("td", null, value))),
              ),
            ),
          ),
      );
    }

    /** The pane's tab chip: the label the dock shows for this pane. */
    function SidebarPaneTitle(props) {
      const t = typeof props.t === "function" ? props.t : (key) => key;
      return h("span", null, t("sidebar.title"));
    }

    const CSS = `.dcp-wrap{position:relative;display:inline-flex;--dcp-width:380px;--dcp-max-h:68vh;--dcp-title:14px;--dcp-section:13px;--dcp-body:12px;--dcp-small:11px;--dcp-value:15px;--dcp-gap:10px;--dcp-pad:12px;--dcp-bar:9px;--dcp-dot:6px}
.dcp-trigger{display:inline-flex;align-items:center;gap:5px;height:26px;padding:0 8px;border:none;border-radius:var(--dsw-radius-sm,8px);background:transparent;color:var(--dsw-alias-label-secondary);font:inherit;font-size:12px;line-height:16px;cursor:pointer}
.dcp-trigger:hover,.dcp-trigger[data-open]{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary)}
.dcp-trigger-text{font-variant-numeric:tabular-nums}
.dcp-ring-bg{fill:none;stroke:var(--dsw-alias-border-l2);stroke-width:2}
.dcp-ring-fg{fill:none;stroke:var(--dsw-alias-state-business-primary);stroke-width:2;transition:stroke-dasharray .3s ease}
.dcp-panel{position:absolute;top:calc(100% + 6px);right:0;z-index:40;width:var(--dcp-width);max-width:calc(100vw - 32px);display:flex;flex-direction:column;border:0;border-radius:var(--dsw-radius-lg,12px);background:var(--dsw-specific-menu,var(--dsw-alias-bg-layer-2,var(--dsw-alias-bg-base)));backdrop-filter:var(--dsw-menu-backdrop-filter,none);--dsw-elevation-stroke-color:var(--dsw-alias-border-l1);box-shadow:var(--dsw-elevation-prominent,var(--dsw-shadow-lv2,0 8px 24px rgba(0,0,0,.16)));overflow:hidden}
.dcp-head{display:flex;align-items:center;justify-content:space-between;min-height:48px;padding:10px 14px 10px 18px;border-bottom:1px solid var(--dsw-alias-border-l2);flex:none}
.dcp-title{color:var(--dsw-alias-label-primary);font-size:var(--dcp-title);font-weight:500;line-height:22px}
.dcp-iconbtn{height:28px;padding:0 10px;border:none;border-radius:var(--dsw-radius-xs,6px);background:transparent;color:var(--dsw-alias-label-tertiary);font:inherit;font-size:var(--dcp-small);cursor:pointer}
.dcp-iconbtn:hover,.dcp-iconbtn[data-active]{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary)}
.dcp-body{padding:var(--dcp-pad) var(--dcp-pad) calc(var(--dcp-pad) + 2px);overflow-y:auto;max-height:var(--dcp-max-h);display:flex;flex-direction:column;gap:var(--dcp-gap);--dsh-scrollbar-thumb:var(--dsw-alias-scrollbar-bg-l2);--dsh-scrollbar-thumb-hover:var(--dsw-alias-scrollbar-hover-l2)}
.dcp-card{display:flex;flex-direction:column;gap:10px;padding:var(--dcp-pad);border:1px solid var(--dsw-alias-border-l2);border-radius:var(--dsw-radius-md,10px);background:var(--dsw-alias-settings-card-fill,transparent)}
.dcp-card-head{display:flex;align-items:center;justify-content:space-between;gap:10px}
.dcp-card-title{color:var(--dsw-alias-label-primary);font-size:var(--dcp-section);font-weight:600;line-height:20px}
.dcp-pill{padding:2px 9px;border-radius:999px;font-size:var(--dcp-small);line-height:18px}
.dcp-pill-ok{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-state-success-primary)}
.dcp-pill-watch{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-state-warn-primary)}
.dcp-pill-over{background:var(--dsw-alias-interactive-bg-hover-danger);color:var(--dsw-alias-state-error-primary)}
.dcp-win{display:flex;flex-direction:column;gap:8px}
.dcp-win-head{display:flex;align-items:baseline;justify-content:space-between;gap:10px}
.dcp-win-used{color:var(--dsw-alias-label-tertiary);font-size:var(--dcp-small);line-height:18px}
.dcp-win-of{color:var(--dsw-alias-label-primary);font-size:var(--dcp-value);font-weight:600;font-variant-numeric:tabular-nums}
.dcp-track{position:relative;height:var(--dcp-bar);border-radius:999px;background:var(--dsw-alias-interactive-bg-hover);overflow:visible}
.dcp-fill{display:block;height:100%;border-radius:999px}
.dcp-fill-ok{background:var(--dsw-alias-state-business-primary)}
.dcp-fill-watch{background:var(--dsw-alias-state-warn-primary)}
.dcp-fill-over{background:var(--dsw-alias-state-error-primary)}
.dcp-fill-idle{background:var(--dsw-alias-label-tertiary)}
.dcp-mark{position:absolute;top:-2px;width:2px;height:calc(var(--dcp-bar) + 5px);border-radius:1px;background:var(--dsw-alias-label-secondary)}
.dcp-mark-label{position:absolute;top:calc(var(--dcp-bar) + 5px);transform:translateX(-50%);color:var(--dsw-alias-label-caption);font-size:11px;line-height:14px;white-space:nowrap}
.dcp-win-foot{display:flex;align-items:baseline;justify-content:space-between;margin-top:20px;color:var(--dsw-alias-label-secondary);font-size:var(--dcp-small);line-height:18px;font-variant-numeric:tabular-nums}
.dcp-over{color:var(--dsw-alias-state-warn-primary)}
.dcp-grid{display:grid;grid-template-columns:1fr 1fr;gap:8px}
.dcp-metric{display:flex;flex-direction:column;gap:2px;padding:8px 10px;border-radius:var(--dsw-radius-sm,8px);background:var(--dsw-alias-interactive-bg-hover)}
.dcp-metric-label{color:var(--dsw-alias-label-tertiary);font-size:var(--dcp-small);line-height:16px}
.dcp-metric-value{color:var(--dsw-alias-label-primary);font-size:var(--dcp-value);font-weight:600;line-height:24px;font-variant-numeric:tabular-nums}
.dcp-metric-wide{grid-column:1/-1}
.dcp-sub{display:flex;flex-direction:column;gap:8px}
.dcp-sub-head{display:flex;align-items:baseline;justify-content:space-between;gap:10px}
.dcp-sub-title{color:var(--dsw-alias-label-secondary);font-size:var(--dcp-body);font-weight:500}
.dcp-sub-note{color:var(--dsw-alias-label-caption);font-size:var(--dcp-small)}
.dcp-bd{display:flex;flex-direction:column;gap:8px}
.dcp-bd-track{display:flex;height:var(--dcp-bar);border-radius:999px;background:var(--dsw-alias-interactive-bg-hover);overflow:hidden}
.dcp-bd-seg{display:block;height:100%;min-width:0}
.dcp-seg-system{background:var(--dsw-alias-state-warn-primary)}
.dcp-seg-tools{background:var(--dsw-alias-state-business-primary)}
.dcp-seg-messages{background:var(--dsw-static-deepseek-300,var(--dsw-alias-state-business-primary))}
.dcp-seg-uncached{background:var(--dsw-alias-label-tertiary)}
.dcp-seg-cacheRead{background:var(--dsw-alias-state-success-primary)}
.dcp-seg-cacheWrite{background:var(--dsw-alias-state-warn-primary)}
.dcp-seg-output{background:var(--dsw-alias-state-business-primary)}
.dcp-bd-legend{display:grid;grid-template-columns:1fr 1fr;gap:4px 14px;margin:0;padding:0;list-style:none}
.dcp-bd-item{display:flex;align-items:center;gap:7px;min-width:0}
.dcp-dot{flex:none;width:var(--dcp-dot);height:var(--dcp-dot);border-radius:50%}
.dcp-bd-label{flex:1;min-width:0;color:var(--dsw-alias-label-secondary);font-size:var(--dcp-body);line-height:19px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.dcp-bd-value{color:var(--dsw-alias-label-primary);font-size:var(--dcp-body);font-variant-numeric:tabular-nums}
.dcp-table{width:100%;border-collapse:collapse;font-size:var(--dcp-body)}
.dcp-table th{color:var(--dsw-alias-label-tertiary);font-weight:400;text-align:left;padding:4px 0;border-bottom:1px solid var(--dsw-alias-border-l2)}
.dcp-table td{padding:3px 0;color:var(--dsw-alias-label-primary);font-variant-numeric:tabular-nums;vertical-align:top}
.dcp-table td:first-child{color:var(--dsw-alias-label-secondary);padding-right:10px}
.dcp-table td:last-child{text-align:right;white-space:nowrap}
.dcp-note{margin:0;color:var(--dsw-alias-label-tertiary);font-size:var(--dcp-body);line-height:19px}
.dcp-mcp{display:flex;flex-direction:column;gap:4px;margin:0;padding:0;list-style:none}
.dcp-mcp-item{display:flex;align-items:center;gap:8px;min-width:0}
.dcp-mcp-name{flex:1;min-width:0;color:var(--dsw-alias-label-secondary);font-size:var(--dcp-body);line-height:19px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-family:var(--dsw-font-markdown-code-font-family,ui-monospace,monospace)}
.dcp-mcp-count{color:var(--dsw-alias-label-tertiary);font-size:var(--dcp-body);font-variant-numeric:tabular-nums;white-space:nowrap}
.dcp-mcp-bytes{color:var(--dsw-alias-label-primary);font-size:var(--dcp-body);font-variant-numeric:tabular-nums;white-space:nowrap}
.dcp-head-actions{display:flex;align-items:center;gap:2px}
.dcp-pane{display:flex;flex-direction:column;gap:var(--dcp-gap);height:100%;min-height:0;overflow-y:auto;padding:var(--dcp-pad);box-sizing:border-box;--dsh-scrollbar-thumb:var(--dsw-alias-scrollbar-bg-l2);--dsh-scrollbar-thumb-hover:var(--dsw-alias-scrollbar-hover-l2);
  /* Each surface states its own scale instead of inheriting one: the narrow docked
     column must never read larger than the popover. */
  --dcp-title:14px;--dcp-section:13px;--dcp-body:12px;--dcp-small:11px;--dcp-value:15px;--dcp-gap:10px;--dcp-pad:12px;--dcp-bar:9px;--dcp-dot:6px}
`;

    /** One <style> tag per load; the loader removes plugin-owned tags on unload. */
    function injectStyle() {
      if (typeof document === "undefined") return;
      const tagId = `${NS}/panel.css`;
      if (document.querySelector(`style[data-plugin-css=${JSON.stringify(tagId)}]`) === null) {
        const tag = document.createElement("style");
        tag.dataset.pluginCss = tagId;
        tag.textContent = CSS;
        document.head.append(tag);
      }
    }

    /** Services required for locale registration and slot contribution. */
    const inject = ["slots", "locale"];

    /**
     * Client plugin body.
     * @param ctx - client root context.
     */
    function apply(ctx) {
      injectStyle();
      ctx.effect(() => ctx.locale.register(NS, { zh, en }), "dsh-context-panel: dictionaries");
      const t =
        typeof ctx.locale?.bind === "function" ? ctx.locale.bind(NS) : (key) => key;
      /** Open (or reveal) this panel as a docked sidebar tab. Never throws into the UI. */
      const openInSidebar = () => {
        const controller = ctx.get("sidebarRight");
        if (controller === undefined || typeof controller.openTab !== "function") return;
        try {
          controller.openTab(PANEL_KIND);
        } catch (error) {
          ctx.logger?.warn?.(`dsh-context-panel: sidebar tab did not open: ${String(error)}`);
        }
      };
      ctx.slots.inject("conversation.session.header.actions", () =>
        ctx.slots.register(
          {
            name: "conversation.session.header.actions",
            id: "dsh-context-panel",
            order: 25,
            locale: NS,
            inject: () => ({ openInSidebar }),
          },
          Panel,
        ),
      );
      // The docked pane is optional: a deployment without the right sidebar keeps the
      // header popover working, so its services are injected conditionally instead of
      // joining this plugin's own `inject` list — where a missing service would hold
      // the whole plugin pending and take the popover down with it.
      ctx.inject(["sidebarRight", "sidebarRightTabs"], (sidebarCtx) => {
        sidebarCtx.effect(
          () =>
            sidebarCtx.sidebarRightTabs.register({
              id: PANEL_ID,
              kind: PANEL_KIND,
              // Keep the pane mounted while the user visits another tab, so the host
              // payload it fetched survives the switch.
              keepMounted: true,
              title: () => t("sidebar.title"),
            }),
          "dsh-context-panel: sidebar tab type",
        );
        sidebarCtx.slots.inject("sidebar.right.pane.tab", () =>
          sidebarCtx.slots.register({ name: "sidebar.right.pane.tab", key: PANEL_ID, locale: NS }, SidebarPane),
        );
        sidebarCtx.slots.inject("sidebar.right.pane.tab.title", () =>
          sidebarCtx.slots.register({ name: "sidebar.right.pane.tab.title", key: PANEL_ID, locale: NS }, SidebarPaneTitle),
        );
      });
    }

    return { apply, inject };
  },
});
