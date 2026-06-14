import { HttpError } from "../http.mjs";

export function createOpenAiAdapter(config, options = {}) {
  const fetchImpl = options.fetchImpl ?? globalThis.fetch;
  if (!config?.openai?.baseUrl || !config?.openai?.apiKey || !fetchImpl) {
    return null;
  }

  return {
    async complete(input) {
      const runtime = input.config ?? {};
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), Number(runtime.timeoutMs ?? config.openai.timeoutMs));
      try {
        const response = await fetchImpl(resolveChatUrl(config.openai.baseUrl), {
          method: "POST",
          headers: {
            authorization: `Bearer ${config.openai.apiKey}`,
            "content-type": "application/json"
          },
          body: JSON.stringify({
            model: runtime.model ?? config.openai.model,
            messages: [
              {
                role: "system",
                content: systemPrompt(input.scene)
              },
              {
                role: "user",
                content: String(input.prompt ?? "")
              }
            ],
            temperature: Number(runtime.temperature ?? 0.3),
            max_tokens: Number(runtime.maxTokens ?? 1024)
          }),
          signal: controller.signal
        });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) {
          throw new HttpError(502, "AI_PROVIDER_ERROR", "AI provider returned an error.", {
            status: response.status,
            providerCode: payload.error?.code ?? null
          });
        }
        const answer = payload.choices?.[0]?.message?.content;
        if (!answer) {
          throw new HttpError(502, "AI_PROVIDER_EMPTY_RESPONSE", "AI provider returned an empty response.");
        }
        return {
          scene: input.scene,
          type: "model",
          answer,
          bullets: [],
          guidance: null,
          fallback: false,
          model: runtime.model ?? config.openai.model
        };
      } catch (error) {
        if (error.name === "AbortError") {
          throw new HttpError(504, "AI_PROVIDER_TIMEOUT", "AI provider request timed out.");
        }
        throw error;
      } finally {
        clearTimeout(timeout);
      }
    }
  };
}

function resolveChatUrl(baseUrl) {
  const url = new URL(baseUrl);
  if (!url.pathname.endsWith("/chat/completions")) {
    url.pathname = `${url.pathname.replace(/\/+$/, "")}/chat/completions`;
  }
  return url;
}

function systemPrompt(scene) {
  return [
    "你是邻帮平台的 AI 助手。",
    "你只能回答规则、整理摘要、辅助筛选和生成草稿。",
    "不得自动接单、确认订单、结算、退款、裁决纠纷或封禁用户。",
    `当前场景: ${scene}`
  ].join("\n");
}
