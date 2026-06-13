// @vitest-environment jsdom
import { describe, expect, test } from "vitest";
import { normalizeRuntimeConfig } from "../../frontend/src/spa/runtime";
import { withQuery, createApiClient } from "../../frontend/src/spa/api";

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
});
