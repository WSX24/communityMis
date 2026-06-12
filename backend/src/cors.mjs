import { HttpError } from "./http.mjs";

export function applyCorsHeaders(request, response, config) {
  const origin = request.headers.origin;
  if (!origin) {
    return;
  }

  if (!config.corsOrigins.includes(origin)) {
    throw new HttpError(403, "CORS_ORIGIN_FORBIDDEN", "The request origin is not allowed.");
  }

  response.setHeader("access-control-allow-origin", origin);
  response.setHeader("vary", appendVary(response.getHeader("vary"), "Origin"));
  response.setHeader("access-control-allow-credentials", "true");
  response.setHeader("access-control-allow-methods", "GET,HEAD,POST,PUT,PATCH,DELETE,OPTIONS");
  response.setHeader("access-control-allow-headers", "content-type,authorization,x-csrf-token,x-request-id");
}

export function handleCorsPreflight(request, response, config) {
  applyCorsHeaders(request, response, config);
  response.writeHead(204, {
    "cache-control": "no-store"
  });
  response.end();
}

function appendVary(current, value) {
  const values = new Set(String(current ?? "").split(",").map((item) => item.trim()).filter(Boolean));
  values.add(value);
  return Array.from(values).join(", ");
}
