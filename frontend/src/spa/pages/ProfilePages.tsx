import React from "react";
import { useParams } from "react-router-dom";
import type { ApiClient } from "../api";
import { useAuth } from "../auth";
import { FileUpload, Field, PageHeader, StateView, asArray, text, useAsync } from "./shared";

export function ProfilePage({ api }: { api: ApiClient }) {
  const auth = useAuth();
  const state = useAsync(() => api.users.me(), [api]);
  const user = (state.data?.user ?? state.data) as Record<string, unknown> | null;
  return (
    <>
      <PageHeader title="个人中心" action={<button className="btn btn--secondary" onClick={() => auth.logout().then(() => window.location.href = "/login")}>退出登录</button>} />
      <StateView loading={state.loading} error={state.error} empty={!user}>
        <section className="panel profile-panel">
          <div className="avatar xl">{text(user?.displayName ?? user?.username).slice(0, 1)}</div>
          <h2>{text(user?.displayName ?? user?.username)}</h2>
          <p>{text(user?.bio, "暂无简介")}</p>
          <FileUpload purpose="avatar" businessType="user" visibility="public" onUploaded={async (formData) => {
            const result = await api.files.upload(formData);
            const fileId = text((result.file as Record<string, unknown>)?.fileId ?? result.fileId, "");
            if (fileId) await api.users.avatar(fileId);
            window.location.reload();
          }} />
        </section>
      </StateView>
    </>
  );
}

export function SettingsPage({ api }: { api: ApiClient }) {
  const state = useAsync(() => api.settings.me(), [api]);
  const settings = (state.data?.settings ?? {}) as Record<string, unknown>;
  return (
    <>
      <PageHeader title="设置" />
      <StateView loading={state.loading} error={state.error}>
        <form className="panel form-grid" onSubmit={async (event) => {
          event.preventDefault();
          const form = new FormData(event.currentTarget);
          await api.settings.updateMe({
            notifications: form.get("notifications") === "on",
            darkMode: form.get("darkMode")
          });
          window.location.reload();
        }}>
          <label className="check-row"><input type="checkbox" name="notifications" defaultChecked={Boolean(settings.notifications ?? true)} /> 通知提醒</label>
          <Field label="深色模式"><select name="darkMode" defaultValue={text(settings.darkMode, "system")}><option value="system">跟随系统</option><option value="light">浅色</option><option value="dark">深色</option></select></Field>
          <button className="btn btn--primary">保存设置</button>
        </form>
      </StateView>
    </>
  );
}

export function UserPublicPage({ api }: { api: ApiClient }) {
  const { id = "" } = useParams();
  const state = useAsync(() => api.users.public(id), [api, id]);
  const user = (state.data?.user ?? state.data) as Record<string, unknown> | null;
  return (
    <>
      <PageHeader title="服务者公开主页" />
      <StateView loading={state.loading} error={state.error} empty={!user}>
        <section className="panel profile-panel">
          <div className="avatar xl">{text(user?.displayName ?? user?.username).slice(0, 1)}</div>
          <h2>{text(user?.displayName ?? user?.username)}</h2>
          <p>{text(user?.bio, "暂无简介")}</p>
          <div className="action-row">
            <button className="btn btn--primary" onClick={() => api.users.follow(id).then(() => window.location.reload())}>关注</button>
            <a className="btn btn--secondary" href="/messages">联系用户</a>
          </div>
        </section>
      </StateView>
    </>
  );
}

export function CreditPage({ api }: { api: ApiClient }) {
  const id = new URLSearchParams(window.location.search).get("userId") || "";
  const state = useAsync(() => id ? api.users.credit(id) : api.users.me(), [api, id]);
  const reviews = asArray<Record<string, unknown>>(state.data, "reviews");
  return (
    <>
      <PageHeader title="信用详情" />
      <StateView loading={state.loading} error={state.error} empty={reviews.length === 0}>
        <div className="card-list">{reviews.map((review) => <article className="card" key={text(review.reviewId)}><strong>{text(review.rating)} 分</strong><p>{text(review.content)}</p></article>)}</div>
      </StateView>
    </>
  );
}

export function HelpPage() {
  return (
    <>
      <PageHeader title="帮助与规则" />
      <section className="panel prose">
        <h2>平台规则</h2>
        <p>发布需求、接单、评价和纠纷处理均以真实账户与订单记录为准。</p>
      </section>
    </>
  );
}
