import { HttpError, methodNotAllowed, readJsonBody, sendJson } from "../http.mjs";
import { appendCookie, clearCookie } from "../cookies.mjs";

export async function handleAuthRoutes({ request, response, url, authService }) {
  if (url.pathname === "/api/auth/register") {
    allowOnly(request, response, ["POST"]);
    const body = await readJsonBody(request);
    const payload = await authService.register(withRequestMeta(body, request));
    setAuthCookies(response, authService, payload);
    sendJson(response, 201, payload);
    return true;
  }

  if (url.pathname === "/api/auth/login") {
    allowOnly(request, response, ["POST"]);
    const body = await readJsonBody(request);
    const payload = await authService.login(withRequestMeta(body, request));
    setAuthCookies(response, authService, payload);
    sendJson(response, 200, payload);
    return true;
  }

  if (url.pathname === "/api/auth/logout") {
    allowOnly(request, response, ["POST"]);
    const context = await authService.authenticateRequest(request);
    const payload = await authService.logout(context);
    clearAuthCookies(response, authService);
    sendJson(response, 200, payload);
    return true;
  }

  if (url.pathname === "/api/auth/me") {
    allowOnly(request, response, ["GET"]);
    const context = await authService.authenticateRequest(request);
    sendJson(response, 200, { user: authService.publicUser(context.user) });
    return true;
  }

  if (url.pathname === "/api/admin/auth/login") {
    allowOnly(request, response, ["POST"]);
    const body = await readJsonBody(request);
    const payload = await authService.loginAdmin(withRequestMeta(body, request));
    setAuthCookies(response, authService, payload);
    sendJson(response, 200, payload);
    return true;
  }

  if (url.pathname === "/api/admin/auth/me") {
    allowOnly(request, response, ["GET"]);
    const context = await authService.authenticateRequest(request);
    authService.requireRole(context, ["admin", "super_admin"]);
    sendJson(response, 200, { user: authService.publicUser(context.user) });
    return true;
  }

  return false;
}

function setAuthCookies(response, authService, payload) {
  const cookieOptions = authService.cookie ?? {};
  const expires = payload.expiresAt ? new Date(payload.expiresAt) : undefined;
  appendCookie(response, "sid", payload.session.sessionId, {
    path: "/",
    domain: cookieOptions.domain,
    httpOnly: true,
    secure: cookieOptions.secure,
    sameSite: cookieOptions.sameSite,
    expires
  });
  appendCookie(response, "csrf_token", payload.session.csrfToken, {
    path: "/",
    domain: cookieOptions.domain,
    httpOnly: false,
    secure: cookieOptions.secure,
    sameSite: cookieOptions.sameSite,
    expires
  });
}

function clearAuthCookies(response, authService) {
  const cookieOptions = authService.cookie ?? {};
  for (const name of ["sid", "csrf_token"]) {
    clearCookie(response, name, {
      path: "/",
      domain: cookieOptions.domain,
      secure: cookieOptions.secure,
      sameSite: cookieOptions.sameSite
    });
  }
}

function withRequestMeta(body, request) {
  return {
    ...body,
    ipAddress: clientIp(request),
    userAgent: request.headers["user-agent"] ?? null
  };
}

function clientIp(request) {
  const forwarded = request.headers["x-forwarded-for"];
  if (typeof forwarded === "string" && forwarded.trim()) {
    return forwarded.split(",")[0].trim();
  }
  return request.socket?.remoteAddress ?? null;
}

function allowOnly(request, response, methods) {
  if (!methods.includes(request.method)) {
    methodNotAllowed(response, methods);
    throw new HttpError(0, "HANDLED", "Response was already handled.");
  }
}
