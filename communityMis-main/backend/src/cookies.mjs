export function parseCookies(request) {
  const header = request.headers.cookie;
  const cookies = new Map();
  if (typeof header !== "string" || !header.trim()) {
    return cookies;
  }

  for (const part of header.split(";")) {
    const index = part.indexOf("=");
    if (index === -1) {
      continue;
    }
    const key = part.slice(0, index).trim();
    const value = part.slice(index + 1).trim();
    if (key) {
      cookies.set(key, decodeURIComponent(value));
    }
  }
  return cookies;
}

export function appendCookie(response, name, value, options = {}) {
  const next = serializeCookie(name, value, options);
  const current = response.getHeader("set-cookie");
  if (!current) {
    response.setHeader("set-cookie", next);
  } else if (Array.isArray(current)) {
    response.setHeader("set-cookie", [...current, next]);
  } else {
    response.setHeader("set-cookie", [current, next]);
  }
}

export function clearCookie(response, name, options = {}) {
  appendCookie(response, name, "", {
    ...options,
    maxAge: 0,
    expires: new Date(0)
  });
}

export function serializeCookie(name, value, options = {}) {
  const parts = [`${name}=${encodeURIComponent(value)}`];
  if (options.maxAge !== undefined) {
    parts.push(`Max-Age=${Math.max(0, Number(options.maxAge) || 0)}`);
  }
  if (options.expires instanceof Date) {
    parts.push(`Expires=${options.expires.toUTCString()}`);
  }
  parts.push(`Path=${options.path ?? "/"}`);
  if (options.domain) {
    parts.push(`Domain=${options.domain}`);
  }
  if (options.httpOnly) {
    parts.push("HttpOnly");
  }
  if (options.secure) {
    parts.push("Secure");
  }
  if (options.sameSite) {
    parts.push(`SameSite=${options.sameSite}`);
  }
  return parts.join("; ");
}
