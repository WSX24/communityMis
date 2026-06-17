import React from "react";
import type { ApiClient } from "../api";
import type { AppRoute } from "../types";
import { Badge, DataTable, Field, PageHeader, StateView, asArray, friendlyError, text, useAsync } from "./shared";

export function AdminDashboardPage({ api }: { api: ApiClient }) {
  const state = useAsync(() => api.admin.dashboard(), [api]);
  const metrics = (state.data?.metrics ?? {}) as Record<string, unknown>;
  return (
    <>
      <PageHeader title="管理仪表盘" />
      <StateView loading={state.loading} error={state.error}>
        <section className="metric-grid">
          {[
            ["用户", metrics.userCount],
            ["订单", metrics.orderCount],
            ["纠纷", metrics.disputeCount],
            ["流通时间币", metrics.circulatingCoins]
          ].map(([label, value]) => <div className="metric-card" key={String(label)}><span>{String(label)}</span><strong>{text(value, "0")}</strong></div>)}
        </section>
      </StateView>
    </>
  );
}

export function AdminGenericPage({ api, route }: { api: ApiClient; route: AppRoute }) {
  const loader = adminLoader(api, route.id);
  const state = useAsync(loader, [api, route.id]);
  return (
    <>
      <PageHeader title={route.title} />
      <StateView loading={state.loading} error={state.error}>
        <AdminPayloadView payload={state.data ?? {}} routeId={route.id} />
      </StateView>
    </>
  );
}

export function AdminSystemPage({ api }: { api: ApiClient }) {
  const state = useAsync(async () => {
    const [system, backups, audit] = await Promise.all([
      api.admin.system(),
      api.admin.backups(),
      api.admin.auditLogs({ page: 1, pageSize: 6, targetType: "system" })
    ]);
    return { system, backups, audit };
  }, [api]);
  const settings = (state.data?.system.settings ?? {}) as Record<string, unknown>;
  const backups = asArray<Record<string, unknown>>(state.data?.backups, "backups");
  const audits = asArray<Record<string, unknown>>(state.data?.audit, "auditLogs");
  const [error, setError] = React.useState("");
  return (
    <>
      <PageHeader title="系统设置" />
      <StateView loading={state.loading} error={state.error}>
        <section className="panel form-grid">
          <h2>系统配置</h2>
          <form className="form-grid" onSubmit={async (event) => {
            event.preventDefault();
            const form = new FormData(event.currentTarget);
            await api.admin.updateSystem({
              maintenanceMode: form.get("maintenanceMode") === "on",
              announcement: form.get("announcement")
            });
            window.location.reload();
          }}>
            <label className="check-row"><input type="checkbox" name="maintenanceMode" defaultChecked={Boolean(settings.maintenanceMode)} /> 维护模式</label>
            <Field label="公告"><textarea name="announcement" rows={3} defaultValue={text(settings.announcement, "")} /></Field>
            <button className="btn btn--primary">保存系统设置</button>
          </form>
        </section>
        <section className="panel">
          <div className="section-heading">
            <h2>系统配置快照</h2>
            <button className="btn btn--primary" onClick={async () => {
              try {
                await api.admin.createBackup({ confirmText: "立即备份", reason: "manual-snapshot" });
                window.location.reload();
              } catch (reason) {
                setError(friendlyError(reason));
              }
            }}>生成快照</button>
          </div>
          {error ? <p className="field-error">{error}</p> : null}
          <DataTable columns={["快照", "状态", "大小", "时间", "操作"]} rows={backups.map((item) => [
            text(item.label ?? item.backupId),
            <Badge key="status" tone={text(item.status) === "ready" ? "success" : "warning"}>{text(item.status)}</Badge>,
            text(item.sizeBytes),
            text(item.createdAt),
            <BackupActions key="actions" api={api} item={item} />
          ])} />
        </section>
        <section className="panel">
          <h2>系统审计</h2>
          <DataTable columns={["时间", "动作", "对象", "详情"]} rows={audits.map((item) => [
            text(item.createdAt),
            text(item.action),
            text(item.targetType),
            text(item.detail)
          ])} />
        </section>
      </StateView>
    </>
  );
}

function BackupActions({ api, item }: { api: ApiClient; item: Record<string, unknown> }) {
  const id = text(item.backupId, "");
  return (
    <div className="action-row">
      <button className="btn btn--secondary btn--sm" onClick={async () => {
        const confirmText = window.prompt("输入 恢复备份 以确认配置快照恢复");
        if (confirmText === "恢复备份") {
          await api.admin.restoreBackup(id, { confirmText, reason: "manual-restore" });
          window.location.reload();
        }
      }}>恢复快照</button>
      <button className="btn btn--secondary btn--sm" onClick={async () => {
        const confirmText = window.prompt("输入 删除备份 以确认删除配置快照");
        if (confirmText === "删除备份") {
          await api.admin.deleteBackup(id, { confirmText, reason: "manual-delete" });
          window.location.reload();
        }
      }}>删除</button>
    </div>
  );
}

function adminLoader(api: ApiClient, id: string) {
  switch (id) {
    case "admin-users": return () => api.admin.users({ page: 1, pageSize: 20 });
    case "admin-transactions": return () => api.admin.transactions({ page: 1, pageSize: 20 });
    case "admin-disputes":
    case "admin-dispute-final": return () => api.admin.disputes({ page: 1, pageSize: 20 });
    case "admin-stats": return () => api.admin.stats();
    case "admin-ai-logs": return () => api.admin.aiCallLogs({ page: 1, pageSize: 20 });
    case "admin-ai-conversations": return () => api.admin.aiConversations({ page: 1, pageSize: 20 });
    case "admin-ai-feedback": return () => api.admin.aiFeedback({ page: 1, pageSize: 20 });
    case "admin-ai-errors": return () => api.admin.aiErrors({ page: 1, pageSize: 20 });
    case "admin-ai-config": return () => api.admin.aiConfig();
    case "admin-categories": return () => api.admin.categories();
    case "admin-sensitive-words": return () => api.admin.sensitiveWords({ page: 1, pageSize: 20 });
    case "admin-risk-content": return () => api.admin.riskContent({ page: 1, pageSize: 20 });
    case "admin-audit-log": return () => api.admin.auditLogs({ page: 1, pageSize: 20 });
    default: return () => api.admin.dashboard();
  }
}

function AdminPayloadView({ payload, routeId }: { payload: Record<string, unknown>; routeId: string }) {
  const key = collectionKey(payload);
  const rows = key ? asArray<Record<string, unknown>>(payload, key) : [];
  if (rows.length) {
    const columns = Object.keys(rows[0]).slice(0, 6);
    return <DataTable columns={columns} rows={rows.map((row) => columns.map((column) => text(row[column])))} />;
  }
  return <pre className="json-panel">{JSON.stringify(payload, null, 2)}</pre>;
}

function collectionKey(payload: Record<string, unknown>) {
  return ["users", "transactions", "disputes", "auditLogs", "categories", "tags", "sensitiveWords", "riskContents", "callLogs", "conversations", "feedback", "errors"]
    .find((key) => Array.isArray(payload[key]));
}
