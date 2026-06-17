import { HttpError, sendJson, methodNotAllowed } from "../http.mjs";

export async function handleJuryRoutes({ request, response, url, authService }) {
  if (url.pathname === "/api/jury/disputes") {
    if (!["GET"].includes(request.method)) { methodNotAllowed(response, ["GET"]); throw new HttpError(0, "HANDLED"); }
    const context = await authService.authenticateRequest(request);
    authService.requireRole(context, ["user"]);
    if (!context.user || !context.user.isJury) {
      throw new HttpError(403, "JURY_FORBIDDEN", "Only jury members can list disputes.");
    }
    let disputes = [];
    if (typeof authService.store.listAdminDisputes === "function") {
      const page = Math.max(1, parseInt(url.searchParams.get("page") || "1", 10) || 1);
      const result = await authService.store.listAdminDisputes({ page, pageSize: 50 });
      disputes = (result.disputes || []).map(function(item) {
        const isParty = Number(item.initiatorId) === Number(context.user.userId) || Number(item.respondentId) === Number(context.user.userId);
        return {
          disputeId: item.disputeId, orderId: item.orderId, initiatorId: item.initiatorId,
          respondentId: item.respondentId, type: item.type, reason: item.reason,
          status: item.status, finalResult: item.finalResult, refundAmount: item.refundAmount,
          createdAt: item.createdAt, updatedAt: item.updatedAt,
          isParty: isParty
        };
      });
    }
    sendJson(response, 200, {
      disputes: disputes,
      pagination: { page: 1, pageSize: 50, total: disputes.length, totalPages: 1, hasNext: false, hasPrev: false }
    });
    return true;
  }
  return false;
}
