import React from "react";
import { useNavigate, useParams } from "react-router-dom";
import type { ApiClient } from "../api";
import { FileUpload, Field, PageHeader, StateView, asArray, friendlyError, text, useAsync } from "./shared";

export function TasksPage({ api }: { api: ApiClient }) {
  const state = useAsync(() => api.requests.list({ page: 1, pageSize: 20 }), [api]);
  const requests = asArray<Record<string, unknown>>(state.data, "requests");
  return (
    <>
      <PageHeader title="任务市场" action={<a className="btn btn--primary" href="/post">发布</a>} />
      <StateView loading={state.loading} error={state.error} empty={requests.length === 0}>
        <div className="card-list">
          {requests.map((item) => (
            <article className="card" key={text(item.requestId)}>
              <a className="card-title" href={`/posts/${text(item.requestId)}`}>{text(item.title)}</a>
              <p>{text(item.description || item.content)}</p>
              <div className="action-row"><a className="btn btn--secondary" href={`/posts/${text(item.requestId)}`}>查看详情</a></div>
            </article>
          ))}
        </div>
      </StateView>
    </>
  );
}

export function PostPage({ api }: { api: ApiClient }) {
  const navigate = useNavigate();
  const [error, setError] = React.useState("");
  const [draft, setDraft] = React.useState("");
  const [files, setFiles] = React.useState<string[]>([]);
  return (
    <>
      <PageHeader title="发布需求" />
      <form className="panel form-grid" onSubmit={async (event) => {
        event.preventDefault();
        const form = new FormData(event.currentTarget);
        try {
          const payload = await api.requests.create({
            title: form.get("title"),
            description: form.get("description"),
            categoryId: form.get("categoryId") || null,
            estimatedHours: Number(form.get("estimatedHours") || 0),
            coinAmount: Number(form.get("coinAmount") || 0),
            attachmentFileIds: files
          });
          navigate(`/posts/${text((payload.request as Record<string, unknown>)?.requestId ?? payload.requestId)}`, { replace: true });
        } catch (reason) {
          setError(friendlyError(reason));
        }
      }}>
        <Field label="标题"><input name="title" required /></Field>
        <Field label="描述"><textarea name="description" rows={6} required defaultValue={draft} /></Field>
        <Field label="类别 ID"><input name="categoryId" inputMode="numeric" /></Field>
        <Field label="预计耗时"><input name="estimatedHours" type="number" min="0.5" step="0.5" required /></Field>
        <Field label="时间币报酬"><input name="coinAmount" type="number" min="1" step="0.01" required /></Field>
        <div className="action-row">
          <button className="btn btn--secondary" type="button" onClick={async () => {
            const result = await api.ai.requestDraft({ prompt: "帮我写一个社区互助需求草稿" });
            setDraft(text(result.draft ?? result.content ?? result.message, ""));
          }}>AI 草稿</button>
        </div>
        <FileUpload purpose="request-image" businessType="request" visibility="public" onUploaded={async (formData) => {
          const result = await api.files.upload(formData);
          const fileId = text((result.file as Record<string, unknown>)?.fileId ?? result.fileId, "");
          if (fileId) setFiles((current) => [...current, fileId]);
        }} />
        {files.length ? <p className="muted">已上传 {files.length} 个附件</p> : null}
        {error ? <p className="field-error" role="alert">{error}</p> : null}
        <button className="btn btn--primary">发布</button>
      </form>
    </>
  );
}

export function RequestDetailPage({ api }: { api: ApiClient }) {
  const { id = "" } = useParams();
  const detail = useAsync(() => api.requests.detail(id), [api, id]);
  const commentsState = useAsync(() => api.requestComments.list(id), [api, id]);
  const request = (detail.data?.request ?? detail.data) as Record<string, unknown> | null;
  const comments = asArray<Record<string, unknown>>(commentsState.data, "comments");
  const [error, setError] = React.useState("");
  return (
    <>
      <PageHeader title="帖子详情" />
      <StateView loading={detail.loading} error={detail.error} empty={!request}>
        <article className="panel">
          <h2>{text(request?.title)}</h2>
          <p>{text(request?.description || request?.content)}</p>
          <div className="action-row">
            <button className="btn btn--primary" onClick={() => api.requests.accept(id).then(() => window.location.reload()).catch((reason) => setError(friendlyError(reason)))}>接单</button>
            <a className="btn btn--secondary" href={`/users/${text(request?.publisherId ?? request?.userId)}`}>联系用户</a>
          </div>
          {error ? <p className="field-error">{error}</p> : null}
        </article>
      </StateView>
      <section className="panel">
        <h2>评论</h2>
        <StateView loading={commentsState.loading} error={commentsState.error} empty={comments.length === 0}>
          <div className="comment-list">{comments.map((comment) => <p key={text(comment.commentId)}>{text(comment.content)}</p>)}</div>
        </StateView>
        <form className="inline-form" onSubmit={async (event) => {
          event.preventDefault();
          const form = new FormData(event.currentTarget);
          await api.requestComments.create(id, { content: form.get("content") });
          window.location.reload();
        }}>
          <input name="content" placeholder="写评论" required />
          <button className="btn btn--primary">发送</button>
        </form>
      </section>
    </>
  );
}
