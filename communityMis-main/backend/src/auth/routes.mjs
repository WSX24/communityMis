import { HttpError, methodNotAllowed, readJsonBody, sendJson } from "../http.mjs";
import { appendCookie, clearCookie } from "../cookies.mjs";
import { hashPassword, verifyPassword } from "./password.mjs";

const AUTH_SESSION_DETAIL_RE = /^\/api\/auth\/sessions\/([^/]+)$/;

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

  if (url.pathname === "/api/auth/me/password") {
    allowOnly(request, response, ["PUT"]);
    const context = await authService.authenticateRequest(request);
    const body = await readJsonBody(request);
    const currentPassword = String(body.currentPassword ?? body.oldPassword ?? "");
    const nextPassword = String(body.newPassword ?? body.password ?? "");
    if (!verifyPassword(currentPassword, context.user.passwordHash)) {
      throw new HttpError(401, "INVALID_CREDENTIALS", "Current password is incorrect.");
    }
    if (nextPassword.length < 8 || nextPassword.length > 128) {
      throw new HttpError(400, "INVALID_PASSWORD", "Password must be 8-128 characters.");
    }
    if (typeof authService.store.updateUserPasswordHash !== "function") {
      throw new HttpError(500, "AUTH_STORE_UNAVAILABLE", "Password update is not available.");
    }
    await authService.store.updateUserPasswordHash(context.user.userId, hashPassword(nextPassword));
    const revoked = typeof authService.store.revokeOtherSessions === "function"
      ? await authService.store.revokeOtherSessions({ userId: context.user.userId, keepSessionId: context.session.sessionId })
      : { revoked: 0 };
    sendJson(response, 200, { ok: true, revoked });
    return true;
  }

  if (url.pathname === "/api/auth/sessions") {
    allowOnly(request, response, ["GET"]);
    const context = await authService.authenticateRequest(request);
    if (typeof authService.store.listSessionsForUserId !== "function") {
      throw new HttpError(500, "AUTH_STORE_UNAVAILABLE", "Session listing is not available.");
    }
    const sessions = await authService.store.listSessionsForUserId(context.user.userId);
    sendJson(response, 200, {
      sessions: sessions.map((session) => sessionDto(session, context.session.sessionId))
    });
    return true;
  }

  if (url.pathname === "/api/auth/sessions/others") {
    allowOnly(request, response, ["DELETE"]);
    const context = await authService.authenticateRequest(request);
    if (typeof authService.store.revokeOtherSessions !== "function") {
      throw new HttpError(500, "AUTH_STORE_UNAVAILABLE", "Session revocation is not available.");
    }
    sendJson(response, 200, await authService.store.revokeOtherSessions({
      userId: context.user.userId,
      keepSessionId: context.session.sessionId
    }));
    return true;
  }

  const sessionMatch = url.pathname.match(AUTH_SESSION_DETAIL_RE);
  if (sessionMatch) {
    allowOnly(request, response, ["DELETE"]);
    const context = await authService.authenticateRequest(request);
    const sessionId = decodeURIComponent(sessionMatch[1]);
    if (sessionId === "others") {
      return false;
    }
    await authService.store.revokeSession(sessionId);
    if (sessionId === context.session.sessionId) {
      clearAuthCookies(response, authService);
    }
    sendJson(response, 200, { ok: true, revokedSessionId: sessionId });
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

function sessionDto(session, currentSessionId) {
  return {
    sessionId: session.sessionId,
    userId: session.userId,
    role: session.role,
    ipAddress: session.ipAddress ?? null,
    userAgent: session.userAgent ?? null,
    createdAt: session.createdAt,
    expiresAt: session.expiresAt,
    revokedAt: session.revokedAt ?? null,
    current: session.sessionId === currentSessionId,
    active: !session.revokedAt && new Date(session.expiresAt).getTime() > Date.now()
  };
}

function allowOnly(request, response, methods) {
  if (!methods.includes(request.method)) {
    methodNotAllowed(response, methods);
    throw new HttpError(0, "HANDLED", "Response was already handled.");
  }
}
