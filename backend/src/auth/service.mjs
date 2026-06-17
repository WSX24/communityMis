import crypto from "node:crypto";
import { HttpError } from "../http.mjs";
import { parseCookies } from "../cookies.mjs";
import { hashPassword, verifyPassword } from "./password.mjs";
import { createMemoryAuthStore, ACTIVE_STATUS, INITIAL_TIME_COIN_BALANCE, normalizeUsername } from "./store.mjs";
import { createSignedSessionToken, verifySignedSessionToken } from "./tokens.mjs";
import { verifyRegistrationCodes } from "../verification/routes.mjs";
import { enforceRateLimit, rateLimitIdentity } from "../rate-limit.mjs";
import { generateIdenticon } from "./identicon.mjs";

const ADMIN_ROLES = new Set(["admin", "super_admin"]);
const DEFAULT_SESSION_TTL_MS = 24 * 60 * 60 * 1000;

export function createAuthService(options = {}) {
  const store = options.store ?? createMemoryAuthStore();
  const sessionSecret = options.sessionSecret ?? process.env.AUTH_SESSION_SECRET ?? crypto.randomBytes(32).toString("base64url");
  const sessionTtlMs = options.sessionTtlMs ?? DEFAULT_SESSION_TTL_MS;
  const cookie = {
    domain: options.cookie?.domain ?? null,
    secure: Boolean(options.cookie?.secure),
    sameSite: options.cookie?.sameSite ?? "Lax"
  };

  return {
    register,
    login,
    loginAdmin,
    authenticateRequest,
    requireRole,
    logout,
    publicUser,
    cookie,
    store
  };

  async function register(input) {
    const body = normalizeRegistrationInput(input);
    await enforceRateLimit(store, {
      scope: "auth:register:ip",
      identity: rateLimitIdentity(input?.ipAddress),
      limit: 20,
      windowSeconds: 60 * 60
    });
    await enforceRateLimit(store, {
      scope: "auth:register:email",
      identity: rateLimitIdentity(body.email),
      limit: 5,
      windowSeconds: 60 * 60
    });
    await verifyRegistrationCodes(store, {
      ...input,
      phone: body.phone,
      email: body.email
    });

    // Build identicon PNG buffer deterministically from username
    let identiconPng;
    try {
      identiconPng = generateIdenticon(body.username, 256);
    } catch {
      identiconPng = null;
    }
    let created;
    try {
      created = await store.createUserWithWallet({
        username: body.username,
        passwordHash: hashPassword(body.password),
        phone: body.phone,
        email: body.email,
        displayName: body.displayName,
        bio: body.bio,
        serviceCategories: body.serviceCategories,
        skillTags: body.skillTags,
        role: "user",
        status: ACTIVE_STATUS,
        initialBalance: INITIAL_TIME_COIN_BALANCE,
        identiconPng
      });
    } catch (error) {
      if (error.code === "DUPLICATE_USERNAME") {
        throw new HttpError(409, "USERNAME_EXISTS", "Username is already registered.");
      }
      throw error;
    }

    return {
      ...(await createLoginPayload(created.user, input)),
      user: publicUser(created.user),
      wallet: publicWallet(created.wallet)
    };
  }

  async function login(input) {
    return loginWithPolicy(input, { adminOnly: false });
  }

  async function loginAdmin(input) {
    return loginWithPolicy(input, { adminOnly: true });
  }

  async function authenticateRequest(request, options = {}) {
    if (request.authContext) {
      return request.authContext;
    }

    const sid = sessionIdFromCookie(request);
    const token = options.allowBearer === false ? null : bearerToken(request);
    // Prefer Bearer token for tab-isolated sessions; fall back to cookie-based session
    let sessionSid = null;
    if (token) {
      const verified = verifySignedSessionToken(token, sessionSecret, new Date());
      if (verified?.sid) {
        sessionSid = verified.sid;
      }
    }
    if (!sessionSid && sid) {
      sessionSid = sid;
    }
    if (token && !sessionSid) {
      throw new HttpError(401, "INVALID_TOKEN", "Authentication token is invalid or expired.");
    }
    if (!sessionSid) {
      throw new HttpError(401, "UNAUTHENTICATED", "Authentication is required.");
    }
    const tokenPayload = { sid: sessionSid };

    const now = new Date();
    const session = await store.findSession(tokenPayload.sid);
    if (!session || session.revokedAt || new Date(session.expiresAt).getTime() <= now.getTime()) {
      throw new HttpError(401, "INVALID_SESSION", "Authentication session is invalid or expired.");
    }

    const user = await store.findUserById(session.userId);
    if (!user) {
      throw new HttpError(401, "INVALID_SESSION", "Authentication session is invalid or expired.");
    }
    if (user.status !== ACTIVE_STATUS) {
      throw new HttpError(403, "USER_DISABLED", "Disabled users cannot perform this operation.");
    }

    const context = { token, session, user };
    request.authContext = context;
    return context;
  }

  function requireRole(context, roles) {
    if (!roles.includes(context.user.role)) {
      throw new HttpError(403, "FORBIDDEN", "You do not have permission to access this resource.");
    }
    return context;
  }

  async function logout(context) {
    await store.revokeSession(context.session.sessionId);
    return { ok: true };
  }

  async function loginWithPolicy(input, options) {
    const body = normalizeLoginInput(input);
    await enforceRateLimit(store, {
      scope: options.adminOnly ? "auth:admin_login" : "auth:login",
      identity: rateLimitIdentity(body.username, input?.ipAddress),
      limit: options.adminOnly ? 10 : 20,
      windowSeconds: 15 * 60
    });
    let user = await store.findUserByUsername(body.username);
    if (!user && typeof store.findUserByEmail === "function") {
      user = await store.findUserByEmail(body.username);
    }
    if (!user && typeof store.findUserByPhone === "function") {
      user = await store.findUserByPhone(body.username);
    }
    if (!user || !verifyPassword(body.password, user.passwordHash)) {
      throw new HttpError(401, "INVALID_CREDENTIALS", "Username or password is incorrect.");
    }
    if (user.status !== ACTIVE_STATUS) {
      throw new HttpError(403, "USER_DISABLED", "Disabled users cannot log in.");
    }
    if (options.adminOnly && !ADMIN_ROLES.has(user.role)) {
      throw new HttpError(403, "FORBIDDEN", "Administrator privileges are required.");
    }

    return createLoginPayload(user, input);
  }

  async function createLoginPayload(user, input = {}) {
    const expiresAt = new Date(Date.now() + sessionTtlMs).toISOString();
    const csrfToken = crypto.randomBytes(32).toString("base64url");
    const session = await store.createSession({
      userId: user.userId,
      role: user.role,
      expiresAt,
      csrfToken,
      ipAddress: input?.ipAddress,
      userAgent: input?.userAgent
    });
    const token = createSignedSessionToken({
      sid: session.sessionId,
      uid: user.userId,
      role: user.role,
      exp: new Date(expiresAt).getTime()
    }, sessionSecret);

    return {
      token,
      tokenType: "Bearer",
      expiresAt,
      session: {
        sessionId: session.sessionId,
        expiresAt,
        csrfToken
      },
      user: publicUser(user)
    };
  }
}

export function publicUser(user) {
  return {
    userId: user.userId,
    username: user.username,
    phone: user.phone,
    email: user.email ?? null,
    displayName: user.displayName ?? user.username,
    bio: user.bio ?? null,
    skillTags: user.skillTags,
    serviceCategories: user.serviceCategories ?? [],
    avatarFileId: user.avatarFileId ?? null,
    avatarUrl: user.avatarFileId ? `/api/files/${encodeURIComponent(user.avatarFileId)}` : null,
    isJury: Boolean(user.isJury),
    role: user.role,
    status: user.status,
    createdAt: user.createdAt
  };
}

function publicWallet(wallet) {
  return {
    walletId: wallet.walletId,
    userId: wallet.userId,
    balance: wallet.balance,
    frozenBalance: wallet.frozenBalance,
    version: wallet.version
  };
}

function normalizeRegistrationInput(input) {
  const rawUsername = input?.username;
  let username;
  if (typeof rawUsername === "string" && rawUsername.trim()) {
    username = normalizeUsername(rawUsername);
  } else {
    username = `user_${crypto.randomBytes(4).toString("hex")}`;
  }
  const password = typeof input?.password === "string" ? input.password : "";

  if (!/^[a-zA-Z0-9_]{3,50}$/.test(username)) {
    throw new HttpError(400, "INVALID_USERNAME", "Username must be 3-50 letters, numbers, or underscores.");
  }
  if (password.length < 8 || password.length > 128) {
    throw new HttpError(400, "INVALID_PASSWORD", "Password must be 8-128 characters.");
  }

  return {
    username,
    password,
    phone: optionalText(input?.phone, 20),
    email: requiredEmail(input?.email),
    displayName: optionalText(input?.displayName, 50),
    bio: optionalText(input?.bio, 300),
    serviceCategories: Array.isArray(input?.serviceCategories) ? input.serviceCategories.map((item) => String(item).trim()).filter(Boolean).slice(0, 10) : [],
    skillTags: Array.isArray(input?.skillTags) ? input.skillTags.map((item) => String(item).trim()).filter(Boolean).slice(0, 20) : []
  };
}

function normalizeLoginInput(input) {
  const rawUsername = input?.username;
  let username;
  if (typeof rawUsername === "string" && rawUsername.trim()) {
    username = normalizeUsername(rawUsername);
  } else {
    username = `user_${crypto.randomBytes(4).toString("hex")}`;
  }
  const password = typeof input?.password === "string" ? input.password : "";
  if (!username || !password) {
    throw new HttpError(400, "INVALID_LOGIN_BODY", "Username (or email/phone) and password are required.");
  }
  return { username, password };
}

function optionalText(value, maxLength) {
  if (value === undefined || value === null) {
    return null;
  }
  const text = String(value).trim();
  if (text.length > maxLength) {
    throw new HttpError(400, "INVALID_FIELD", "One or more fields are too long.");
  }
  return text ? text : null;
}

function requiredEmail(value) {
  const text = optionalText(value, 120);
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(text)) {
    throw new HttpError(400, "INVALID_EMAIL", "A valid email address is required.");
  }
  return text.toLowerCase();
}

function bearerToken(request) {
  const authorization = request.headers.authorization;
  if (typeof authorization !== "string") {
    return null;
  }
  const match = authorization.match(/^Bearer\s+(.+)$/i);
  return match ? match[1].trim() : null;
}

function sessionIdFromCookie(request) {
  const sid = parseCookies(request).get("sid");
  return sid ? String(sid) : null;
}
