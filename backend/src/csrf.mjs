import { parseCookies } from "./cookies.mjs";
import { HttpError } from "./http.mjs";

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

export async function enforceCsrf(request, authService) {
  if (SAFE_METHODS.has(request.method)) {
    return;
  }
  const pathname = String(request.url ?? "").split("?")[0];
  if (isPublicMutation(pathname)) {
    return;
  }

  const cookies = parseCookies(request);
  if (!cookies.has("sid")) {
    return;
  }

  const context = await authService.authenticateRequest(request, { allowBearer: false });
  const headerToken = request.headers["x-csrf-token"];
  const csrfToken = Array.isArray(headerToken) ? headerToken[0] : headerToken;
  if (!csrfToken || csrfToken !== context.session.csrfToken) {
    throw new HttpError(403, "CSRF_TOKEN_INVALID", "A valid CSRF token is required for this request.");
  }
  request.authContext = context;
}

function isPublicMutation(pathname) {
  return [
    "/api/auth/register",
    "/api/auth/login",
    "/api/admin/auth/login",
    "/api/verification/sms/send",
    "/api/verification/email/send"
  ].includes(pathname);
}
