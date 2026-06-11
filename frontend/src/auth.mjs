export const authStorageKeys = {
  user: "neighbor.auth.user",
  admin: "neighbor.auth.admin",
  profiles: "neighbor.auth.profiles"
};

export function createAuthController(options = {}) {
  const api = options.api;
  const storage = options.storage ?? safeLocalStorage();
  const location = options.location ?? globalThis.location;

  return {
    readSession,
    saveSession,
    clearSession,
    loginUser,
    registerUser,
    loginAdmin,
    logoutUser,
    logoutAdmin,
    refreshUser,
    refreshAdmin,
    guardRoute,
    updateUserProfile,
    saveProfileDraft,
    readProfileDraft
  };

  function readSession(kind) {
    const session = readJson(authStorageKeys[kind]);
    if (!isValidSession(session)) {
      clearSession(kind);
      return null;
    }
    return session;
  }

  function saveSession(kind, payload) {
    const session = {
      token: payload.token,
      tokenType: payload.tokenType ?? "Bearer",
      expiresAt: payload.expiresAt ?? null,
      user: payload.user ?? null
    };
    writeJson(authStorageKeys[kind], session);
    return session;
  }

  function clearSession(kind) {
    storage?.removeItem?.(authStorageKeys[kind]);
  }

  async function loginUser(credentials) {
    const result = await api.auth.login(credentials);
    return saveSession("user", result);
  }

  async function registerUser(payload, profileDraft = {}) {
    await api.auth.register(payload);
    const session = await loginUser({
      username: payload.username,
      password: payload.password
    });
    saveProfileDraft(session.user, {
      ...profileDraft,
      phone: payload.phone ?? profileDraft.phone ?? null,
      skillTags: payload.skillTags ?? profileDraft.skillTags ?? []
    });
    if (api.users?.updateMe) {
      const profilePayload = normalizeProfileDraft({
        ...profileDraft,
        phone: payload.phone ?? profileDraft.phone ?? null,
        skillTags: payload.skillTags ?? profileDraft.skillTags ?? []
      });
      if (Object.keys(profilePayload).length > 0) {
        await updateUserProfile(profilePayload, session);
      }
    }
    return session;
  }

  async function loginAdmin(credentials) {
    const result = await api.adminAuth.login(credentials);
    return saveSession("admin", result);
  }

  async function logoutUser() {
    await logout("user");
  }

  async function logoutAdmin() {
    await logout("admin");
  }

  async function refreshUser() {
    return refresh("user");
  }

  async function refreshAdmin() {
    return refresh("admin");
  }

  async function guardRoute(route) {
    if (route.surface === "user") {
      return requireSession("user", "/login");
    }
    if (route.surface === "admin") {
      return requireSession("admin", "/admin/login");
    }
    if (route.surface === "userAuth") {
      return redirectIfAuthenticated("user", "/feed");
    }
    if (route.surface === "adminAuth") {
      return redirectIfAuthenticated("admin", "/admin/dashboard");
    }
    return { status: "public" };
  }

  async function updateUserProfile(profileDraft, existingSession = readSession("user")) {
    if (!existingSession?.token) {
      return null;
    }
    const result = await api.users.updateMe(existingSession.token, normalizeProfileDraft(profileDraft));
    const updatedSession = {
      ...existingSession,
      user: result.user ?? existingSession.user
    };
    writeJson(authStorageKeys.user, updatedSession);
    saveProfileDraft(updatedSession.user, {
      ...profileDraft,
      ...(result.user ?? {})
    });
    return result;
  }

  function saveProfileDraft(user, profileDraft) {
    if (!user || !storage) {
      return;
    }
    const profiles = readJson(authStorageKeys.profiles) ?? {};
    profiles[profileKey(user)] = {
      ...profiles[profileKey(user)],
      ...profileDraft,
      updatedAt: new Date().toISOString()
    };
    writeJson(authStorageKeys.profiles, profiles);
  }

  function readProfileDraft(user) {
    if (!user) {
      return null;
    }
    const profiles = readJson(authStorageKeys.profiles) ?? {};
    return profiles[profileKey(user)] ?? null;
  }

  async function logout(kind) {
    const session = readSession(kind);
    clearSession(kind);
    if (!session?.token) {
      return;
    }
    try {
      await api.auth.logout(session.token);
    } catch (error) {
      if (!isAuthError(error)) {
        throw error;
      }
    }
  }

  async function refresh(kind) {
    const session = readSession(kind);
    if (!session?.token) {
      return null;
    }
    try {
      const payload = kind === "admin"
        ? await api.adminAuth.me(session.token)
        : await api.auth.me(session.token);
      const updated = {
        ...session,
        user: payload.user ?? session.user
      };
      writeJson(authStorageKeys[kind], updated);
      return updated;
    } catch (error) {
      if (isAuthError(error)) {
        clearSession(kind);
        return null;
      }
      throw error;
    }
  }

  async function requireSession(kind, loginPath) {
    const session = await refresh(kind);
    if (session) {
      return { status: "allowed", session };
    }
    redirect(withRedirect(loginPath));
    return { status: "redirected" };
  }

  async function redirectIfAuthenticated(kind, targetPath) {
    const session = await refresh(kind);
    if (session) {
      redirect(targetPath);
      return { status: "redirected", session };
    }
    return { status: "public" };
  }

  function redirect(path) {
    if (location?.replace) {
      location.replace(path);
      return;
    }
    if (location) {
      location.href = path;
    }
  }

  function withRedirect(loginPath) {
    const currentPath = location?.pathname && location.pathname !== loginPath
      ? location.pathname
      : "";
    if (!currentPath) {
      return loginPath;
    }
    return `${loginPath}?redirect=${encodeURIComponent(currentPath)}`;
  }

  function readJson(key) {
    if (!storage) {
      return null;
    }
    try {
      const raw = storage.getItem(key);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }

  function writeJson(key, value) {
    if (!storage) {
      return;
    }
    storage.setItem(key, JSON.stringify(value));
  }
}

export function isAuthError(error) {
  return error?.status === 401 || error?.status === 403;
}

function isValidSession(session) {
  if (!session?.token) {
    return false;
  }
  if (!session.expiresAt) {
    return true;
  }
  return new Date(session.expiresAt).getTime() > Date.now();
}

function profileKey(user) {
  return user.userId ? `id:${user.userId}` : `username:${String(user.username ?? "").toLowerCase()}`;
}

function normalizeProfileDraft(input = {}) {
  const output = {};
  for (const key of ["displayName", "phone", "bio"]) {
    if (Object.prototype.hasOwnProperty.call(input, key)) {
      output[key] = input[key] ?? null;
    }
  }
  for (const key of ["skillTags", "serviceCategories"]) {
    if (Array.isArray(input[key])) {
      output[key] = input[key].map((item) => String(item).trim()).filter(Boolean);
    }
  }
  return output;
}

function safeLocalStorage() {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}
