// @vitest-environment jsdom
import fs from "node:fs";
import path from "node:path";
import { describe, expect, test } from "vitest";
import { normalizeRuntimeConfig } from "../../frontend/src/spa/runtime";
import { withQuery, createApiClient } from "../../frontend/src/spa/api";
import { routes } from "../../frontend/src/routes.mjs";

describe("frontend runtime config", () => {
  test("normalizes defaults and clamps Sentry sample rate", () => {
    const config = normalizeRuntimeConfig({
      apiBaseUrl: "https://mis.example.com",
      appEnv: "production",
      buildVersion: "2026.06.13",
      sentryDsn: "https://public@example.ingest.sentry.io/1",
      sentryTracesSampleRate: 2
    });

    expect(config.apiBaseUrl).toBe("https://mis.example.com");
    expect(config.sentryTracesSampleRate).toBe(1);
    expect(config.sentryIngestOrigin).toBe("https://example.ingest.sentry.io");
  });

  test("builds query strings without empty values", () => {
    expect(withQuery("/api/requests", {
      keyword: "维修",
      status: "",
      tags: ["电脑", "", "网络"],
      page: 2
    })).toBe("/api/requests?keyword=%E7%BB%B4%E4%BF%AE&tags=%E7%94%B5%E8%84%91&tags=%E7%BD%91%E7%BB%9C&page=2");
  });

  test("browser client includes credentials and CSRF header on mutations", async () => {
    const calls: Array<{ url: string; init: RequestInit }> = [];
    Object.defineProperty(document, "cookie", {
      value: "csrf_token=csrf-123",
      configurable: true
    });
    const fetchImpl = (async (url: string | URL | Request, init?: RequestInit) => {
      calls.push({ url: String(url), init: init ?? {} });
      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { "content-type": "application/json" }
      });
    }) as typeof fetch;

    const api = createApiClient({
      apiBaseUrl: "https://api.example.test",
      appEnv: "test",
      buildVersion: "test",
      sentryDsn: "",
      sentryTracesSampleRate: 0,
      sentryIngestOrigin: ""
    }, fetchImpl);

    await api.requests.create({ title: "csrf test" });

    expect(calls[0].url).toBe("https://api.example.test/api/requests");
    expect(calls[0].init.credentials).toBe("include");
    expect(new Headers(calls[0].init.headers).get("x-csrf-token")).toBe("csrf-123");
  });

  test("browser client reads AI chat NDJSON streams", async () => {
    const calls: Array<{ url: string; init: RequestInit }> = [];
    Object.defineProperty(document, "cookie", {
      value: "csrf_token=csrf-stream",
      configurable: true
    });
    const stream = new ReadableStream({
      start(controller) {
        const encoder = new TextEncoder();
        controller.enqueue(encoder.encode(`${JSON.stringify({ type: "start", conversation: { conversationId: 9 } })}\n`));
        controller.enqueue(encoder.encode(`${JSON.stringify({ type: "delta", content: "A" })}\n`));
        controller.enqueue(encoder.encode(`${JSON.stringify({ type: "delta", content: "I" })}\n`));
        controller.enqueue(encoder.encode(`${JSON.stringify({ type: "done", payload: { answer: "AI" } })}\n`));
        controller.close();
      }
    });
    const fetchImpl = (async (url: string | URL | Request, init?: RequestInit) => {
      calls.push({ url: String(url), init: init ?? {} });
      return new Response(stream, {
        status: 200,
        headers: { "content-type": "application/x-ndjson" }
      });
    }) as typeof fetch;

    const api = createApiClient({
      apiBaseUrl: "https://api.example.test",
      appEnv: "test",
      buildVersion: "test",
      sentryDsn: "",
      sentryTracesSampleRate: 0,
      sentryIngestOrigin: ""
    }, fetchImpl);
    const chunks: string[] = [];
    const result = await api.ai.chatStream({ messages: [{ role: "user", content: "hi" }] }, {
      onDelta: (chunk) => chunks.push(chunk)
    });

    expect(calls[0].url).toBe("https://api.example.test/api/ai/chat/stream");
    expect(new Headers(calls[0].init.headers).get("x-csrf-token")).toBe("csrf-stream");
    expect(chunks.join("")).toBe("AI");
    expect(result.answer).toBe("AI");
  });

  test("AI rich text renderer supports Markdown, LaTeX, copy text, and HTML escaping", async () => {
    const { aiRichTextToPlainText, renderAiRichText } = await import("../../frontend/src/shared/ai-rich-text.mjs");

    const html = renderAiRichText("## 标题\n\n公式 $E=mc^2$ 和 <script>alert(1)</script>\n\n- **重点**");
    const plain = aiRichTextToPlainText("## 标题\n\n公式 $E=mc^2$\n\n- **重点**");

    expect(html).toContain("ai-rich-heading");
    expect(html).toContain("ai-math-inline");
    expect(html).toContain("<sup>2</sup>");
    expect(html).toContain("&lt;script&gt;");
    expect(html).not.toContain("<script>");
    expect(plain).toBe("标题\n\n公式 E=mc^2\n\n- 重点");
  });

  test("prototype shell binds visible controls without inline onclick handlers", () => {
    const shell = fs.readFileSync(path.join(process.cwd(), "frontend", "src", "prototype-shell.mjs"), "utf8");

    for (const expected of [
      "function bindBackButton(selector, fallbackPath)",
      "\".wallet-back\"",
      "\".disp-back\"",
      "\".dd-back\"",
      "\".detail-back\"",
      "\".orders-back\"",
      "\".review-back\"",
      "navigateTo(\"/profile\")",
      "navigateTo(\"/wallet/freeze\")",
      "showGlobalMessage(\"时间币用于发布任务",
      "window.__adminAiConfigSnapshot",
      "restoreAdminAiConfigSnapshot",
      "window.__adminAuditLogsCurrentPage",
      "exportAdminAuditLogsCsv",
      "downloadCsv(`audit-logs-current-page-${timestampForFilename(new Date())}.csv`, rows)",
      "function saveAdminFinalDraft(dispute)",
      "function restoreAdminFinalDraft(dispute)",
      "adminDisputeFinalDraft:",
      "if (route.id === \"help\")",
      "function hydrateHelpRoute()",
      "rewriteHelpLinks()",
      "api.admin.importSensitiveWords",
      "api.admin.batchReviewRiskContent",
      "api.admin.batchResolveAiFeedback",
      "api.admin.retryAiErrors",
      "api.admin.createAiIncident",
      "function updateCoinEstimate()",
      "function installDisputeEvidenceUpload",
      "uploadFileAsset(userSession, file, \"dispute-evidence\"",
      "data-ai-select=\"feedback\"",
      "data-risk-select-row"
    ]) {
      expect(shell).toContain(expected);
    }

    expect(shell).not.toContain("onclick=\"history.back()\"");
    expect(shell).not.toContain("onclick=\"showHelp()\"");
    expect(shell).not.toContain("onclick=\"exportCSV()\"");
  });

  test("feed filter chips do not share active state with category chips", () => {
    const shell = fs.readFileSync(path.join(process.cwd(), "frontend", "src", "prototype-shell.mjs"), "utf8");

    expect(shell).toContain("? state.filter === \"all\" && categoryCode === state.category");
    expect(shell).toContain("const active = state.filter === \"all\" && category.code === state.category;");
    expect(shell).toContain("const active = filter === state.filter && !state.category;");
    expect(shell).not.toContain("filterAttr === state.filter && (!state.category || TASK_FILTERS.get(state.filter)?.category === state.category)");
    expect(shell).not.toContain("filter === state.filter && (!state.category || TASK_FILTERS.get(state.filter)?.category === state.category)");
  });

  test("global AI modal uses cookie and CSRF authenticated backend actions", () => {
    const modal = fs.readFileSync(path.join(process.cwd(), "frontend", "public", "ui", "js", "ai-modal.js"), "utf8");

    for (const expected of [
      "'use strict'",
      "window.openAIModal",
      "window._aiModalNavigate",
      "buildModal",
      "injectStyles",
      "requestAIReply",
      "/api/ai/chat",
      "credentials: 'include'",
      "x-csrf-token",
      "data-scene=\"",
      "navigator.clipboard",
      "ai-modal-scene-chip",
      "ai-modal-send-btn",
      "ai-modal-close",
      "ai-modal-new",
      "ai-modal-welcome"
    ]) {
      expect(modal).toContain(expected);
    }

    expect(modal).not.toContain("neighbor:userSession");
    expect(modal).not.toContain("readUserToken");
    expect(modal).not.toContain("authorization: 'Bearer '");
    expect(modal).not.toContain("aiResponses");
    expect(modal).not.toContain("getResponse(");
  });

  test("help route is public read-only and hydrated by the prototype shell", () => {
    const help = routes.find((item) => item.id === "help");

    expect(help?.surface).toBe("public");
    expect(help?.path).toBe("/help");
  });
});
