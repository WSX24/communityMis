import React from "react";
import type { ApiClient } from "../api";
import { Field, PageHeader, StateView, asArray, text, useAsync } from "./shared";
import { aiRichTextToPlainText, renderAiRichText } from "../../shared/ai-rich-text.mjs";

type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  pending?: boolean;
  error?: boolean;
};

export function AiAssistantPage({ api }: { api: ApiClient }) {
  const [messages, setMessages] = React.useState<ChatMessage[]>([]);
  const [streaming, setStreaming] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const chatRef = React.useRef<HTMLDivElement | null>(null);

  React.useEffect(() => {
    const el = chatRef.current;
    if (el) {
      el.scrollTop = el.scrollHeight;
    }
  }, [messages, streaming]);

  return (
    <>
      <PageHeader title="AI 助手" />
      <section className="panel ai-chat">
        <div className="chat-window" ref={chatRef}>
          {messages.map((item) => (
            <article key={item.id} className={`chat-bubble chat-bubble--${item.role}${item.pending ? " chat-bubble--streaming" : ""}${item.error ? " chat-bubble--error" : ""}`} aria-live={item.pending ? "polite" : undefined}>
              <div
                className="chat-markdown prose"
                dangerouslySetInnerHTML={{ __html: renderAiRichText(item.content || (item.pending ? "正在生成..." : "")) || "&nbsp;" }}
              />
              {item.role === "assistant" && !item.pending ? <CopyMessageButton content={item.content} /> : null}
            </article>
          ))}
        </div>
        <form className="inline-form" onSubmit={async (event) => {
          event.preventDefault();
          const formEl = event.currentTarget;
          const form = new FormData(formEl);
          const content = String(form.get("content") ?? "").trim();
          if (!content) return;
          const history = messages.map((item) => ({ role: item.role, content: item.content }));
          const userMessage: ChatMessage = { id: messageId("user"), role: "user", content };
          const assistantId = messageId("assistant");
          const assistantDraft: ChatMessage = { id: assistantId, role: "assistant", content: "", pending: true };
          setMessages((current) => [...current, userMessage, assistantDraft]);
          setBusy(true);
          setStreaming(true);
          formEl.reset();
          try {
            const payload = { messages: [...history, { role: "user", content }] };
            let streamed = "";
            let result: Record<string, unknown> | null = null;
            try {
              result = await api.ai.chatStream(payload, {
                onDelta: (chunk: string) => {
                  streamed += chunk;
                  setMessages((current) => current.map((item) => item.id === assistantId
                    ? { ...item, content: streamed, pending: true }
                    : item));
                }
              }) as Record<string, unknown>;
            } catch {
              result = await api.ai.chat(payload);
            }
            const finalContent = assistantContent(result, streamed);
            setMessages((current) => current.map((item) => item.id === assistantId
              ? { ...item, content: finalContent, pending: false }
              : item));
          } catch (error) {
            setMessages((current) => current.map((item) => item.id === assistantId
              ? { ...item, content: error instanceof Error ? error.message : "AI 服务请求失败。", pending: false, error: true }
              : item));
          } finally {
            setStreaming(false);
            setBusy(false);
          }
        }}>
          <Field label="输入问题"><textarea name="content" rows={3} placeholder="支持 Markdown 和 LaTeX 公式" required /></Field>
          <button className="btn btn--primary" disabled={busy}>{busy ? "生成中" : "发送"}</button>
        </form>
      </section>
    </>
  );
}

function CopyMessageButton({ content }: { content: string }) {
  const [copied, setCopied] = React.useState(false);
  return (
    <button
      type="button"
      className="chat-copy-btn"
      onClick={async () => {
        await copyRichMessage(content);
        setCopied(true);
        window.setTimeout(() => setCopied(false), 1600);
      }}
    >
      {copied ? "已复制" : "复制"}
    </button>
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

function messageId(prefix: string) {
  return globalThis.crypto?.randomUUID?.() ?? `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function assistantContent(payload: unknown, fallback = "") {
  if (!payload || typeof payload !== "object") {
    return fallback || "AI 已返回结果。";
  }
  const record = payload as Record<string, unknown>;
  const message = record.message && typeof record.message === "object" ? record.message as Record<string, unknown> : null;
  return String(record.answer ?? message?.content ?? record.content ?? (fallback || "AI 已返回结果。"));
}

async function copyRichMessage(markdown: string) {
  const html = wrapClipboardHtml(renderAiRichText(markdown));
  const plain = aiRichTextToPlainText(markdown);
  if (navigator.clipboard && typeof ClipboardItem !== "undefined") {
    await navigator.clipboard.write([
      new ClipboardItem({
        "text/html": new Blob([html], { type: "text/html" }),
        "text/plain": new Blob([plain], { type: "text/plain" })
      })
    ]);
    return;
  }
  await navigator.clipboard?.writeText(plain);
}

function wrapClipboardHtml(html: string) {
  return `<article class="ai-rich-content">${html}</article>`;
}
