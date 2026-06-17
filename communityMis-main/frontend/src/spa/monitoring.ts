import * as Sentry from "@sentry/react";
import { onCLS, onFCP, onINP, onLCP, onTTFB } from "web-vitals";
import type { RuntimeConfig, SessionUser } from "./types";

let enabled = false;

export function initMonitoring(config: RuntimeConfig) {
  if (!config.sentryDsn) return;
  enabled = true;
  Sentry.init({
    dsn: config.sentryDsn,
    environment: config.appEnv,
    release: config.buildVersion,
    tracesSampleRate: config.sentryTracesSampleRate,
    beforeSend(event) {
      return scrubEvent(event);
    }
  });

  const report = (metric: { name: string; value: number; rating: string }) => {
    Sentry.addBreadcrumb({
      category: "web-vitals",
      message: metric.name,
      level: metric.rating === "poor" ? "warning" : "info",
      data: { value: metric.value, rating: metric.rating }
    });
  };
  onCLS(report);
  onFCP(report);
  onINP(report);
  onLCP(report);
  onTTFB(report);
}

export function setMonitoringUser(user: SessionUser | null) {
  if (!enabled) return;
  Sentry.setUser(user ? {
    id: String(user.userId),
    username: user.username,
    role: user.role
  } : null);
}

export function captureRouteError(error: unknown, routeId?: string) {
  if (!enabled) return;
  Sentry.withScope((scope) => {
    if (routeId) scope.setTag("route", routeId);
    Sentry.captureException(error);
  });
}

export function captureApiFailure(error: unknown, path?: string) {
  if (!enabled) return;
  Sentry.withScope((scope) => {
    if (path) scope.setTag("api_path", path);
    Sentry.captureException(error);
  });
}

function scrubEvent<T extends Sentry.Event>(event: T): T {
  delete event.request?.cookies;
  delete event.request?.headers;
  if (event.extra) {
    for (const key of Object.keys(event.extra)) {
      if (/phone|message|content|evidence|file/i.test(key)) {
        event.extra[key] = "[Filtered]";
      }
    }
  }
  return event;
}
