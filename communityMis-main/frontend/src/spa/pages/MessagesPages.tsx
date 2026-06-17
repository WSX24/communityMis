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
          text(item.createdAt),
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
  const rows = asArray<Record<string, unknown>>(state.data, "notifications");
  return (
    <>
      <PageHeader title="通知中心" action={<button className="btn btn--secondary" onClick={() => api.notifications.readAll().then(() => window.location.reload())}>全部已读</button>} />
      <StateView loading={state.loading} error={state.error} empty={rows.length === 0}>
        <div className="card-list">{rows.map((item) => (
          <article className="card" key={text(item.notificationId)}>
            <div className="card-title">{text(item.title)}</div>
            <p>{text(item.content)}</p>
          </article>
        ))}</div>
      </StateView>
    </>
  );
}
