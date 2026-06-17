import React from "react";
import type { ApiClient } from "../api";
import { DataTable, Field, PageHeader, StateView, asArray, text, useAsync } from "./shared";

export function MessagesPage({ api }: { api: ApiClient }) {
  const state = useAsync(() => api.messages.list({ pageSize: 30 }), [api]);
  const rows = asArray<Record<string, unknown>>(state.data, "messages");
  return (
    <>
      <PageHeader title="消息中心" />
      <section className="panel">
        <h2>发送私信</h2>
        <MessageForm api={api} />
      </section>
      <StateView loading={state.loading} error={state.error} empty={rows.length === 0}>
        <DataTable columns={["时间", "发件人", "收件人", "内容", "状态"]} rows={rows.map((item) => [
          new Date(String(item.createdAt)).toLocaleString("zh-CN"),
          text(item.senderName ?? item.senderId),
          text(item.receiverName ?? item.receiverId),
          text(item.content),
          text(item.readAt ? "已读" : "未读")
        ])} />
      </StateView>
    </>
  );
}

function MessageForm({ api }: { api: ApiClient }) {
  return (
    <form className="inline-form" onSubmit={async (event) => {
      event.preventDefault();
      const form = new FormData(event.currentTarget);
      await api.messages.send({ receiverId: Number(form.get("receiverId")), content: form.get("content") });
      window.location.reload();
    }}>
      <input name="receiverId" placeholder="用户 ID" inputMode="numeric" required />
      <input name="content" placeholder="消息内容" required />
      <button className="btn btn--primary">发送</button>
    </form>
  );
}

export function NotificationsPage({ api }: { api: ApiClient }) {
  const state = useAsync(() => api.notifications.list({ page: 1, pageSize: 30 }), [api]);
  const settingsState = useAsync(() => api.settings.me(), [api]);
  const rows = asArray<Record<string, unknown>>(state.data, "notifications");
  const summaries = (state.data?.summaries ?? {}) as Record<string, number>;
  const settings = (settingsState.data?.settings ?? {}) as Record<string, unknown>;
  const savedPrefs = (settings.notifications ?? {}) as Record<string, boolean>;

  const [prefs, setPrefs] = React.useState<Record<string, boolean>>({
    orderStatus: true,
    newMessages: true,
    interactions: true,
    announcements: false
  });

  React.useEffect(() => {
    if (settingsState.data) {
      setPrefs({
        orderStatus: savedPrefs.orderStatus ?? true,
        newMessages: savedPrefs.newMessages ?? true,
        interactions: savedPrefs.interactions ?? true,
        announcements: savedPrefs.announcements ?? false
      });
    }
  }, [settingsState.data]);

  const togglePref = (key: string) => {
    const next = { ...prefs, [key]: !prefs[key] };
    setPrefs(next);
    api.settings.updateMe({ notifications: next }).catch(() => {
      setPrefs(prefs);
    });
  };

  return (
    <>
      <PageHeader title="通知中心" action={<button className="btn btn--secondary" onClick={() => api.notifications.readAll().then(() => window.location.reload())}>全部已读</button>} />

      <StateView loading={state.loading || settingsState.loading} error={state.error || settingsState.error} empty={rows.length === 0}>
        <div className="notif-shell">
          <section className="summary-grid" aria-label="通知概览">
            <div className="summary-card"><strong>{summaries.unread ?? 0}</strong><span>未读通知</span></div>
            <div className="summary-card"><strong>{summaries.order ?? 0}</strong><span>订单更新</span></div>
            <div className="summary-card"><strong>{summaries.dispute ?? 0}</strong><span>纠纷更新</span></div>
            <div className="summary-card"><strong>{summaries.social ?? 0}</strong><span>今日互动</span></div>
          </section>

          <section aria-label="通知列表">
            <div className="card-list">{rows.map((item) => (
              <article className="notif-card" key={text(item.notificationId)}>
                <div className="notif-main">
                  <div className="card-title">{text(item.title)}</div>
                  <p className="notif-desc">{text(item.content)}</p>
                  <div className="notif-meta">
                    <span className="badge-state">{text(item.type)}</span>
                    <span className="notif-time">{new Date(String(item.createdAt)).toLocaleString("zh-CN")}</span>
                  </div>
                </div>
              </article>
            ))}</div>
          </section>

          <aside className="side-stack">
            <section className="panel">
              <h2>今日摘要</h2>
              <div className="digest-list">
                {summaries.order > 0 && <div className="digest-row"><strong>订单需要关注</strong><span>你有 {summaries.order} 条订单相关通知。</span></div>}
                {summaries.dispute > 0 && <div className="digest-row"><strong>纠纷更新</strong><span>你有 {summaries.dispute} 条纠纷相关通知。</span></div>}
                {summaries.ai > 0 && <div className="digest-row"><strong>AI 反馈</strong><span>你有 {summaries.ai} 条 AI 相关通知。</span></div>}
                {!(summaries.order || summaries.dispute || summaries.ai) && <div className="digest-row"><strong>暂无摘要</strong><span>当前没有需要特别关注的通知。</span></div>}
              </div>
            </section>

            <section className="panel">
              <h2>通知偏好</h2>
              <div className="setting-row">
                <div><strong>订单进度</strong><span>接单、截止、确认完成</span></div>
                <button className={`switch${prefs.orderStatus ? " on" : ""}`} aria-label="订单进度通知" onClick={() => togglePref("orderStatus")} />
              </div>
              <div className="setting-row">
                <div><strong>纠纷与陪审</strong><span>证据、投票、裁决更新</span></div>
                <button className={`switch${prefs.newMessages ? " on" : ""}`} aria-label="纠纷与陪审通知" onClick={() => togglePref("newMessages")} />
              </div>
              <div className="setting-row">
                <div><strong>互动提醒</strong><span>点赞、评论、关注</span></div>
                <button className={`switch${prefs.interactions ? " on" : ""}`} aria-label="互动提醒通知" onClick={() => togglePref("interactions")} />
              </div>
              <div className="setting-row">
                <div><strong>AI 反馈</strong><span>筛选结果、草稿生成</span></div>
                <button className={`switch${prefs.announcements ? " on" : ""}`} aria-label="AI 反馈通知" onClick={() => togglePref("announcements")} />
              </div>
            </section>
          </aside>
        </div>
      </StateView>
    </>
  );
}
