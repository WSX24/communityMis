import type { RuntimeConfig } from "./types";

const DEFAULT_CONFIG: RuntimeConfig = {
  apiBaseUrl: "",
  appEnv: "development",
  buildVersion: "dev",
  sentryDsn: "",
  sentryTracesSampleRate: 0,
  sentryIngestOrigin: ""
};

let configPromise: Promise<RuntimeConfig> | null = null;

export function loadRuntimeConfig(fetchImpl: typeof fetch = fetch): Promise<RuntimeConfig> {
  if (!configPromise) {
    configPromise = fetchImpl("/config.json", {
      cache: "no-store",
      credentials: "same-origin"
    })
      .then(async (response) => {
        if (!response.ok) {
          throw new Error(`Runtime config request failed with status ${response.status}.`);
        }
        return normalizeRuntimeConfig(await response.json());
      })
      .catch((error) => {
        if (import.meta.env.DEV) {
          return normalizeRuntimeConfig({
            ...DEFAULT_CONFIG,
            apiBaseUrl: import.meta.env.VITE_API_BASE_URL || "http://127.0.0.1:3001",
            appEnv: "development",
            buildVersion: import.meta.env.VITE_BUILD_VERSION || "dev"
          });
        }
        throw error;
      });
  }
  return configPromise;
}

export function normalizeRuntimeConfig(input: Partial<RuntimeConfig> = {}): RuntimeConfig {
  const tracesRate = Number(input.sentryTracesSampleRate ?? 0);
  const sentryDsn = String(input.sentryDsn ?? "");
  return {
    apiBaseUrl: String(input.apiBaseUrl ?? ""),
    appEnv: String(input.appEnv ?? (input as { environment?: string }).environment ?? DEFAULT_CONFIG.appEnv),
    buildVersion: String(input.buildVersion ?? DEFAULT_CONFIG.buildVersion),
    sentryDsn,
    sentryTracesSampleRate: Number.isFinite(tracesRate) ? Math.max(0, Math.min(1, tracesRate)) : 0,
    sentryIngestOrigin: String(input.sentryIngestOrigin ?? originFromDsn(sentryDsn) ?? "")
  };
}

function originFromDsn(dsn: string): string | null {
  if (!dsn) return null;
  try {
    return new URL(dsn).origin;
  } catch {
    return null;
  }
}
