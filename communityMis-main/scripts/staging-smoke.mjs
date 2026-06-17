const baseUrl = normalizeBaseUrl(process.env.STAGING_BASE_URL ?? process.env.BASE_URL);
const checks = [];

await run();

async function run() {
  const health = await fetchJson("/api/health");
  record(health.response.ok, "/api/health returns 2xx");
  record(health.body?.status === "ok", "/api/health reports ok");

  const ready = await fetchJson("/api/ready");
  record(ready.response.ok, "/api/ready returns 2xx");
  record(ready.body?.status === "ready", "/api/ready reports ready");

  for (const route of ["/login", "/feed", "/admin/login", "/admin/dashboard"]) {
    const response = await fetch(`${baseUrl}${route}`, { redirect: "manual" });
    record(response.status >= 200 && response.status < 400, `${route} is reachable`);
    const contentType = response.headers.get("content-type") ?? "";
    record(contentType.includes("text/html"), `${route} serves HTML`);
  }

  for (const item of checks) {
    console.log(`${item.ok ? "ok" : "fail"} - ${item.message}`);
  }
  if (checks.some((item) => !item.ok)) {
    process.exitCode = 1;
  }
}

async function fetchJson(pathname) {
  const response = await fetch(`${baseUrl}${pathname}`, {
    headers: { accept: "application/json" }
  });
  let body = null;
  try {
    body = await response.json();
  } catch {
    body = null;
  }
  return { response, body };
}

function normalizeBaseUrl(value) {
  if (!value) {
    throw new Error("STAGING_BASE_URL is required, for example https://staging.example.com");
  }
  const url = new URL(value);
  if (!["http:", "https:"].includes(url.protocol)) {
    throw new Error("STAGING_BASE_URL must be an absolute http(s) URL.");
  }
  return url.href.replace(/\/+$/, "");
}

function record(ok, message) {
  checks.push({ ok: Boolean(ok), message });
}
