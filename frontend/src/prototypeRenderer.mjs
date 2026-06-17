import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { routePath, routes } from "./routes.mjs";

const CURRENT_FILE = fileURLToPath(import.meta.url);
const FRONTEND_ROOT = path.resolve(path.dirname(CURRENT_FILE), "..");
export const PROJECT_ROOT = path.resolve(FRONTEND_ROOT, "..");
export const UI_SOURCE_ROOT = path.join(PROJECT_ROOT, "UISource");
export const PRODUCTION_UI_ROOT = path.join(FRONTEND_ROOT, "public", "ui");
export const DIST_ROOT = path.join(FRONTEND_ROOT, "dist");

const htmlReplacementPairs = buildHtmlReplacementPairs();

export function renderPrototypeHtml(route, options = {}) {
  const sourceFile = path.join(PRODUCTION_UI_ROOT, route.source);
  const html = fs.readFileSync(sourceFile, "utf8");
  let rewritten = rewriteManifestAssetReferences(
    rewritePrototypeLinks(rewriteAssetReferences(stripDemoBusinessContent(html, route))),
    options
  );
  if (options.stripInlineEvents) {
    rewritten = stripInlineEventHandlers(rewritten);
  }
  if (options.stripInlineScripts) {
    rewritten = stripInlineBusinessScripts(rewritten);
  }
  return injectShell(rewritten, route, options);
}

export function rewritePrototypeLinks(html) {
  let output = html;
  for (const [from, to] of htmlReplacementPairs) {
    output = output.replace(new RegExp(escapeRegExp(from), "g"), to);
  }
  return output;
}

export function rewriteAssetReferences(html) {
  return html
    .replace(/\b(href|src)=(["'])(?:\.\.\/|\.\/)?css\/([^"']+)\2/g, (_match, attr, quote, file) => `${attr}=${quote}/css/${file}${quote}`)
    .replace(/\b(href|src)=(["'])(?:\.\.\/|\.\/)?js\/([^"']+)\2/g, (_match, attr, quote, file) => `${attr}=${quote}/js/${file}${quote}`);
}

export function stripDemoBusinessContent(html, route) {
  let output = html;
  const config = DEMO_CONTENT_RULES[route.id];
  if (!config) {
    return output;
  }

  for (const rule of config.emptyElements ?? []) {
    output = replaceElementContent(output, rule.selector, rule.content ?? "");
  }
  for (const rule of config.removeBlocks ?? []) {
    output = removeBlocks(output, rule.start, rule.end);
  }
  for (const rule of config.replaceRanges ?? []) {
    output = replaceRange(output, rule.start, rule.end, rule.replacement ?? "");
  }
  return output;
}

export function buildRouteIndexHtml(options = {}) {
  const userRoutes = routes.filter((item) => item.surface === "user" || item.surface === "userAuth");
  const adminRoutes = routes.filter((item) => item.surface === "admin" || item.surface === "adminAuth");
  const tokensCss = assetPath("/css/tokens.css", options);
  const shellCss = assetPath("/assets/styles/shell.css", options);

  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>路由未找到 - 邻帮</title>
  <link rel="stylesheet" href="${tokensCss}">
  <link rel="stylesheet" href="${shellCss}">
  <style>
    body { min-height: 100dvh; padding: var(--space-2xl); background: var(--bg); color: var(--fg); }
    main { width: min(100%, 960px); margin: 0 auto; display: grid; gap: var(--space-xl); }
    h1 { font-family: var(--font-display); font-size: 28px; }
    section { display: grid; gap: var(--space-md); }
    .route-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: var(--space-sm); }
    a { display: block; padding: 12px 14px; border: 1px solid var(--border-light); border-radius: var(--radius-md); background: var(--surface); }
    a:hover { color: var(--accent); border-color: var(--accent-light); }
  </style>
</head>
<body>
  <main>
    <header>
      <h1>路由未找到</h1>
      <p class="muted">请选择一个已映射的生产路由。</p>
    </header>
    ${routeGroup("入口", routes.filter((item) => item.surface === "launcher"))}
    ${routeGroup("用户端", userRoutes)}
    ${routeGroup("管理端", adminRoutes)}
  </main>
</body>
</html>`;
}

function routeGroup(title, routeList) {
  return `<section>
    <h2>${title}</h2>
    <div class="route-grid">
      ${routeList.map((item) => `<a href="${routePath(item)}"><strong>${item.title}</strong><br><span class="muted">${item.path}</span></a>`).join("\n")}
    </div>
  </section>`;
}

const runtimeLoading = (message) => `<div data-runtime-placeholder class="runtime-placeholder">${message}</div>`;

const DEMO_CONTENT_RULES = {
  feed: {
    emptyElements: [
      { selector: ".feed-content", content: runtimeLoading("正在加载真实社区动态。") }
    ]
  },
  tasks: {
    emptyElements: [
      { selector: "#task-grid", content: runtimeLoading("正在加载真实任务。") }
    ]
  },
  orders: {
    emptyElements: [
      { selector: "#panel-all", content: runtimeLoading("正在加载真实订单。") },
      { selector: "#panel-posted" },
      { selector: "#panel-accepted" }
    ],
    replaceRanges: [
      { start: "  // Order data", end: "  renderAll();", replacement: "  // Production shell loads orders from backend APIs.\n" }
    ]
  },
  wallet: {
    emptyElements: [
      { selector: "#tx-list", content: runtimeLoading("正在加载真实交易记录。") },
      { selector: "#tx-pagination" }
    ],
    replaceRanges: [
      { start: "  /* ─── Transaction data ─── */", end: "  // Initial render\n  renderTxList();", replacement: "  // Production shell loads wallet data from backend APIs.\n" }
    ]
  },
  messages: {
    emptyElements: [
      { selector: "#tab-chat .msg-list", content: runtimeLoading("正在加载真实私信。") },
      { selector: "#tab-system .msg-list", content: runtimeLoading("正在加载真实通知。") },
      { selector: "#chat-messages" }
    ],
    replaceRanges: [
      { start: "  // 聊天数据", end: "  chatInput.addEventListener('keydown', e => {\n    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }\n  });", replacement: "  // Production shell loads messages from backend APIs.\n" }
    ]
  },
  notifications: {
    emptyElements: [
      { selector: "#notif-list", content: runtimeLoading("正在加载真实通知。") },
      { selector: ".digest-list", content: runtimeLoading("正在加载今日摘要。") }
    ]
  },
  profile: {
    emptyElements: [
      { selector: "#panel-myposts", content: runtimeLoading("正在加载真实帖子。") },
      { selector: "#panel-mytasks", content: runtimeLoading("正在加载真实任务。") },
      { selector: "#panel-accepted", content: runtimeLoading("正在加载真实接单记录。") }
    ]
  },
  "post-detail": {
    emptyElements: [
      { selector: ".detail-content", content: runtimeLoading("正在加载真实需求详情。") }
    ]
  },
  "order-detail": {
    emptyElements: [
      { selector: ".detail-body", content: runtimeLoading("正在加载真实订单详情。") }
    ]
  },
  "wallet-freeze": {
    emptyElements: [
      { selector: "#freezeList", content: runtimeLoading("正在加载真实冻结明细。") }
    ]
  },
  review: {
    emptyElements: [
      { selector: ".review-body", content: runtimeLoading("正在加载真实评价对象。") }
    ]
  },
  "dispute-detail": {
    emptyElements: [
      { selector: ".dd-body", content: runtimeLoading("正在加载真实纠纷详情。") }
    ]
  },
  "jury-voting": {
    emptyElements: [
      { selector: ".jury-page", content: runtimeLoading("正在加载真实陪审材料。") }
    ]
  },
  "user-public": {
    emptyElements: [
      { selector: ".profile-shell", content: runtimeLoading("正在加载真实公开主页。") }
    ]
  },
  credit: {
    emptyElements: [
      { selector: "#review-cards", content: runtimeLoading("正在加载真实信用评价。") }
    ]
  },
  "admin-dashboard": {
    emptyElements: [
      { selector: ".activity-list", content: runtimeLoading("正在加载真实平台动态。") }
    ]
  },
  "admin-users": {
    emptyElements: [
      { selector: "#userTableBody", content: `<tr data-runtime-placeholder><td colspan="7">正在加载真实用户数据。</td></tr>` }
    ],
    replaceRanges: [
      { start: "const users = [", end: "renderTable(users);", replacement: "const users = [];\n" }
    ]
  },
  "admin-transactions": {
    emptyElements: [
      { selector: "#transactionBody", content: `<tr data-runtime-placeholder><td colspan="8">正在加载真实流水数据。</td></tr>` }
    ],
    replaceRanges: [
      { start: "  const transactions = [", end: "  renderTable();", replacement: "  const transactions = [];\n" }
    ]
  },
  "admin-disputes": {
    emptyElements: [
      { selector: "#disputeList", content: runtimeLoading("正在加载真实争议列表。") }
    ]
  },
  "admin-dispute-final": {
    emptyElements: [
      { selector: ".timeline", content: runtimeLoading("正在加载真实纠纷时间线。") },
      { selector: ".jury-table tbody", content: `<tr data-runtime-placeholder><td colspan="5">正在加载真实陪审投票。</td></tr>` }
    ]
  },
  "admin-stats": {
    emptyElements: [
      { selector: ".trend-table tbody", content: `<tr data-runtime-placeholder><td colspan="5">正在加载真实趋势数据。</td></tr>` }
    ]
  },
  "admin-ai-logs": {
    emptyElements: [
      { selector: "#aiLogTbody", content: `<tr data-runtime-placeholder><td colspan="8">正在加载真实 AI 调用日志。</td></tr>` }
    ],
    replaceRanges: [
      { start: "const logs = [", end: "renderTable(logs);", replacement: "const logs = [];\n" }
    ]
  },
  "admin-ai-conversations": {
    emptyElements: [
      { selector: "#conversationRows", content: `<tr data-runtime-placeholder><td colspan="7">正在加载真实 AI 会话。</td></tr>` }
    ]
  },
  "admin-ai-feedback": {
    emptyElements: [
      { selector: "#feedbackRows", content: `<tr data-runtime-placeholder><td colspan="7">正在加载真实 AI 反馈。</td></tr>` }
    ]
  },
  "admin-ai-errors": {
    emptyElements: [
      { selector: "#errorRows", content: `<tr data-runtime-placeholder><td colspan="7">正在加载真实 AI 异常。</td></tr>` }
    ]
  },
  "ai-results": {
    emptyElements: [
      { selector: ".parsed-tags", content: runtimeLoading("正在解析真实筛选条件。") },
      { selector: ".result-list", content: runtimeLoading("正在根据真实需求数据筛选。") }
    ]
  },
  "ai-assistant": {
    emptyElements: [
      { selector: "#hist-panel .hist-list", content: `<div class="hist-item" data-runtime-placeholder><div class="hist-title">正在加载历史对话</div><div class="hist-time">请稍候</div></div>` }
    ]
  },
  "admin-ai-config": {
    emptyElements: [
      { selector: ".audit-preview", content: `<div class="ap-label">📜 审计日志（最近 5 条）</div><div class="audit-entry" data-runtime-placeholder><span class="ae-time">--</span><span class="ae-action">LOAD</span><span class="ae-detail">正在加载真实配置变更记录</span></div>` }
    ],
    replaceRanges: [
      { start: "const savedConfig = {", end: "captureOriginals();", replacement: "const savedConfig = {};\n" }
    ]
  },
  "admin-system": {
    emptyElements: [
      { selector: ".backup-list", content: `<div class="backup-row" data-runtime-placeholder><div class="backup-main"><strong>正在加载配置快照</strong><span>配置快照和人工确认动作将从生产接口读取。</span></div></div>` },
      { selector: ".audit-mini", content: `<div class="audit-row" data-runtime-placeholder><strong>正在加载系统审计</strong><span>真实审计记录将从后端接口读取</span></div>` }
    ]
  },
  "admin-categories": {
    emptyElements: [
      { selector: "#catList", content: runtimeLoading("正在加载真实类别。") },
      { selector: "#tagGrid", content: runtimeLoading("正在加载真实标签。") }
    ],
    replaceRanges: [
      { start: "let categories = [", end: "renderAll();", replacement: "let categories = [];\nlet tags = [];\n" }
    ]
  },
  "admin-sensitive-words": {
    emptyElements: [
      { selector: "#wordTable", content: `<tr data-runtime-placeholder><td colspan="6">正在加载真实敏感词。</td></tr>` }
    ]
  },
  "admin-risk-content": {
    emptyElements: [
      { selector: "#riskRows", content: `<tr data-runtime-placeholder><td colspan="7">正在加载真实风险内容。</td></tr>` }
    ]
  },
  "admin-audit-log": {
    emptyElements: [
      { selector: "#logTable", content: `<tr data-runtime-placeholder><td colspan="7">正在加载真实审计日志。</td></tr>` }
    ],
    replaceRanges: [
      { start: "const logs = [", end: "renderTable(logs);", replacement: "const logs = [];\n" }
    ]
  }
};

function replaceElementContent(html, selector, content) {
  const range = findElementRange(html, selector);
  if (!range) {
    return html;
  }
  return `${html.slice(0, range.openEnd)}\n${content}\n${html.slice(range.closeStart)}`;
}

function findElementRange(html, selector) {
  const parts = selector.trim().split(/\s+/);
  const first = parts.shift();
  const opening = elementOpeningPattern(first);
  if (!opening) {
    return null;
  }
  const match = opening.exec(html);
  if (!match) {
    return null;
  }
  const tag = match[1];
  const openEnd = match.index + match[0].length;
  const closeStart = findMatchingCloseTag(html, tag, openEnd);
  if (closeStart < 0) {
    return null;
  }

  if (parts.length === 0) {
    return { openStart: match.index, openEnd, closeStart };
  }

  const inner = html.slice(openEnd, closeStart);
  const innerRange = findElementRange(inner, parts.join(" "));
  if (!innerRange) {
    return null;
  }
  return {
    openStart: openEnd + innerRange.openStart,
    openEnd: openEnd + innerRange.openEnd,
    closeStart: openEnd + innerRange.closeStart
  };
}

function elementOpeningPattern(selector) {
  if (selector.startsWith("#")) {
    const id = escapeRegExp(selector.slice(1));
    return new RegExp(`<([a-zA-Z][\\w:-]*)\\b(?=[^>]*\\bid=(["'])${id}\\2)[^>]*>`, "i");
  }
  if (selector.startsWith(".")) {
    const className = escapeRegExp(selector.slice(1));
    return new RegExp(`<([a-zA-Z][\\w:-]*)\\b(?=[^>]*\\bclass=(["'])[^"']*\\b${className}\\b[^"']*\\2)[^>]*>`, "i");
  }
  if (/^[a-zA-Z][\w:-]*$/.test(selector)) {
    return new RegExp(`<(${escapeRegExp(selector)})\\b[^>]*>`, "i");
  }
  return null;
}

function findMatchingCloseTag(html, tag, fromIndex) {
  const pattern = new RegExp(`</?${escapeRegExp(tag)}\\b[^>]*>`, "gi");
  pattern.lastIndex = fromIndex;
  let depth = 1;
  let match;
  while ((match = pattern.exec(html))) {
    if (match[0].startsWith("</")) {
      depth -= 1;
      if (depth === 0) {
        return match.index;
      }
    } else if (!match[0].endsWith("/>")) {
      depth += 1;
    }
  }
  return -1;
}

function replaceRange(html, start, end, replacement) {
  const startIndex = html.indexOf(start);
  if (startIndex < 0) {
    return html;
  }
  const endIndex = html.indexOf(end, startIndex + start.length);
  if (endIndex < 0) {
    return html;
  }
  return `${html.slice(0, startIndex)}${replacement}${html.slice(endIndex + end.length)}`;
}

function removeBlocks(html, start, end) {
  return replaceRange(html, start, end, "");
}

function injectShell(html, route, options = {}) {
  const needsAuth = route.surface === "user" || route.surface === "admin";
  const authGuardCss = needsAuth
    ? `<style>html[data-auth-state="checking"] body>*{visibility:hidden}html[data-auth-state="checking"] body{background:var(--bg,#f5f5f5)}html[data-auth-state="checking"] body::after{content:"";position:fixed;inset:0;z-index:9999;background:var(--bg,#f5f5f5)}</style>`
    : "";
  const headInjection = [
    authGuardCss,
    `<link rel="stylesheet" href="${assetPath("/assets/styles/theme.css", options)}">`,
    `<link rel="stylesheet" href="${assetPath("/assets/styles/shell.css", options)}">`
  ].filter(Boolean).join("\n");
  const bodyScript = `<script type="module" src="${assetPath(options.shellLogicalPath ?? "/assets/app/prototype-shell.mjs", options)}"></script>`;

  let output = html;
  if (needsAuth) {
    output = output.replace(/(<html[^>]*)/i, `$1 data-auth-state="checking"`);
  }
  output = output.replace(/<\/head>/i, `${headInjection}\n</head>`);
  output = output.replace(/<body(\s[^>]*)?>/i, (_match, attrs = "") => {
    if (attrs.includes("data-route-id=")) {
      return `<body${attrs}>`;
    }
    return `<body${attrs} data-route-id="${escapeAttribute(route.id)}" data-route-title="${escapeAttribute(route.title)}" data-route-source="${escapeAttribute(route.source)}" data-route-path="${escapeAttribute(route.path)}" data-route-current-path="${escapeAttribute(routePath(route))}" data-route-surface="${escapeAttribute(route.surface)}" data-route-layout="${escapeAttribute(route.layout)}">`;
  });
  output = output.replace(/<\/body>/i, `${bodyScript}\n</body>`);
  return output;
}

export function createRuntimeConfig(options = {}) {
  const env = options.env ?? process.env;
  const mode = options.mode ?? env.NODE_ENV ?? "development";
  const isProduction = mode === "production";
  const apiBaseUrl = env.API_BASE_URL ?? (isProduction ? "" : `http://127.0.0.1:${env.BACKEND_PORT ?? "3001"}`);
  const sentryDsn = env.SENTRY_DSN ?? "";

  if (isProduction && !apiBaseUrl) {
    throw new Error("API_BASE_URL is required when NODE_ENV=production.");
  }
  if (apiBaseUrl && !isHttpUrl(apiBaseUrl)) {
    throw new Error("API_BASE_URL must be an absolute http(s) URL.");
  }
  if (sentryDsn && !isHttpUrl(sentryDsn)) {
    throw new Error("SENTRY_DSN must be an absolute http(s) URL when configured.");
  }

  return {
    apiBaseUrl,
    appEnv: env.APP_ENV ?? (isProduction ? "production" : "development"),
    buildVersion: env.BUILD_VERSION ?? "dev",
    sentryDsn,
    sentryTracesSampleRate: numberValue(env.SENTRY_TRACES_SAMPLE_RATE, 0),
    sentryIngestOrigin: env.SENTRY_INGEST_ORIGIN ?? (sentryDsn ? new URL(sentryDsn).origin : "")
  };
}

function rewriteManifestAssetReferences(html, options) {
  const assets = normalizedAssets(options);
  if (assets.size === 0) {
    return html;
  }
  return html.replace(/\b(href|src)=(["'])(\/(?:css|js)\/[^"']+|\/assets\/(?:styles|app)\/[^"']+)\2/g, (_match, attr, quote, source) => {
    return `${attr}=${quote}${assets.get(source) ?? source}${quote}`;
  });
}

function stripInlineEventHandlers(html) {
  const withAiModalTriggers = html.replace(
    /\s+onclick\s*=\s*(["'])\s*openAIModal\(\s*(["'])(.*?)\2\s*\)\s*;?\s*\1/gi,
    (_match, _outerQuote, _innerQuote, scene) => ` data-ai-modal-scene="${escapeAttribute(scene)}"`
  );
  return withAiModalTriggers.replace(/\s+on[a-z]+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, "");
}

function stripInlineBusinessScripts(html) {
  return html.replace(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi, (match, attrs = "") => {
    if (/\bsrc\s*=/.test(attrs) || /\btype\s*=\s*["']module["']/i.test(attrs)) {
      return match;
    }
    return "";
  });
}

function assetPath(logicalPath, options) {
  return normalizedAssets(options).get(logicalPath) ?? logicalPath;
}

function normalizedAssets(options) {
  const source = options.assets ?? options.assetManifest?.assets ?? {};
  return source instanceof Map ? source : new Map(Object.entries(source));
}

function isHttpUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch (_error) {
    return false;
  }
}

function numberValue(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function buildHtmlReplacementPairs() {
  const pairs = new Map([
    ["../index.html", "/"],
    ["./index.html", "/"],
    ["screens/index.html", "/"],
    ["/index.html", "/"],
    ["index.html", "/"]
  ]);

  for (const item of routes) {
    const target = routePath(item);
    const filename = path.posix.basename(item.source);
    const variants = [
      item.source,
      `./${item.source}`,
      `/${item.source}`,
      `../${item.source}`,
      filename,
      `./${filename}`,
      `../${filename}`,
      `/screens/${filename}`,
      `screens/${filename}`
    ];

    for (const variant of variants) {
      pairs.set(variant, target);
    }
  }

  return [...pairs.entries()].sort((left, right) => right[0].length - left[0].length);
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function escapeAttribute(value) {
  return String(value).replace(/"/g, "&quot;");
}
