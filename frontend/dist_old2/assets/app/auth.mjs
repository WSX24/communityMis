export const authStorageKeys = {
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

  function storageKey(kind) {
    return `neighbor_auth_${kind}`;
  }

  function readSession(kind) {
    try {
      const raw = globalThis.localStorage?.getItem(storageKey(kind));
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (!parsed?.expiresAt) return null;
      if (new Date(parsed.expiresAt).getTime() < Date.now()) {
        globalThis.localStorage?.removeItem(storageKey(kind));
        return null;
      }
      return { token: parsed.token, user: parsed.user, expiresAt: parsed.expiresAt };
    } catch {
      return null;
    }
  }

  function saveSession(kind, payload) {
    const session = {
      token: payload.token ?? null,
      expiresAt: payload.expiresAt ?? null,
      user: payload.user ?? null
    };
    try {
      globalThis.localStorage?.setItem(storageKey(kind), JSON.stringify(session));
    } catch { /* quota exceeded, ignore */ }
    return session;
  }

  function clearSession(kind) {
    try {
      globalThis.localStorage?.removeItem(storageKey(kind));
    } catch { /* ignore */ }
    return null;
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
    const session = existingSession ?? await refresh("user");
    if (!session?.user) {
      return null;
    }
    const result = await api.users.updateMe(null, normalizeProfileDraft(profileDraft));
    const updatedSession = {
      ...session,
      user: result.user ?? session.user
    };
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
    clearSession(kind);
    try {
      await api.auth.logout(null);
    } catch (error) {
      if (!isAuthError(error)) {
        throw error;
      }
    }
  }

  async function refresh(kind) {
    try {
      const stored = readSession(kind);
      const token = stored?.token ?? null;
      const payload = kind === "admin"
        ? await api.adminAuth.me(token)
        : await api.auth.me(token);
      const updated = {
        token: token,
        user: payload.user ?? null,
        expiresAt: stored?.expiresAt ?? null
      };
      saveSession(kind, updated);
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
  return Boolean(session?.user);
}

function profileKey(user) {
  return user.userId ? `id:${user.userId}` : `username:${String(user.username ?? "").toLowerCase()}`;
}

function normalizeProfileDraft(input = {}) {
  const output = {};
  for (const key of ["displayName", "phone", "email", "bio"]) {
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
