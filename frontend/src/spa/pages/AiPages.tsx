import React from "react";
import type { ApiClient } from "../api";
import { Field, PageHeader, StateView, asArray, text, useAsync } from "./shared";

export function AiAssistantPage({ api }: { api: ApiClient }) {
  const [messages, setMessages] = React.useState<{ role: string; content: string }[]>([]);
  const [busy, setBusy] = React.useState(false);
  return (
    <>
      <PageHeader title="AI 助手" />
      <section className="panel ai-chat">
        <div className="chat-window">
          {messages.map((item, index) => <p key={index} className={`chat-bubble chat-bubble--${item.role}`}>{item.content}</p>)}
        </div>
        <form className="inline-form" onSubmit={async (event) => {
          event.preventDefault();
          const form = new FormData(event.currentTarget);
          const content = String(form.get("content") ?? "");
          if (!content) return;
          setMessages((current) => [...current, { role: "user", content }]);
          setBusy(true);
          const result = await api.ai.chat({ messages: [{ role: "user", content }] });
          setMessages((current) => [...current, { role: "assistant", content: text(result.content ?? result.message ?? result.answer) }]);
          setBusy(false);
          event.currentTarget.reset();
        }}>
          <input name="content" placeholder="输入问题" required />
          <button className="btn btn--primary" disabled={busy}>{busy ? "生成中" : "发送"}</button>
        </form>
      </section>
    </>
  );
}

export function AiResultsPage({ api }: { api: ApiClient }) {
  const [result, setResult] = React.useState<Record<string, unknown> | null>(null);
  return (
    <>
      <PageHeader title="AI 筛选结果" />
      <form className="panel form-grid" onSubmit={async (event) => {
        event.preventDefault();
        const prompt = String(new FormData(event.currentTarget).get("prompt") ?? "");
        setResult(await api.ai.requestFilter({ prompt }));
      }}>
        <Field label="筛选描述"><textarea name="prompt" rows={4} required /></Field>
        <button className="btn btn--primary">筛选</button>
      </form>
      {result ? <pre className="json-panel">{JSON.stringify(result, null, 2)}</pre> : null}
    </>
  );
}
