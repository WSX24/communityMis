import { HttpError } from "../http.mjs";

export function createOpenAiAdapter(config, options = {}) {
  const fetchImpl = options.fetchImpl ?? globalThis.fetch;
  const providerConfig = normalizeProviderConfig(config?.openai);
  if (!providerConfig.baseUrl || !providerConfig.apiKey || !fetchImpl) {
    return null;
  }

  return {
    async complete(input) {
      const runtime = input.config ?? {};
      const fallback = normalizeFallback(input.fallback, input.scene);
      const model = providerModel(runtime.model, providerConfig.model);
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), Number(runtime.timeoutMs ?? providerConfig.timeoutMs));
      try {
        const response = await fetchImpl(resolveChatUrl(providerConfig.baseUrl), {
          method: "POST",
          headers: {
            authorization: `Bearer ${providerConfig.apiKey}`,
            "content-type": "application/json"
          },
          body: JSON.stringify(chatRequestBody(input, runtime, model)),
          signal: controller.signal
        });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) {
          return providerFailure(fallback, "AI_PROVIDER_ERROR", "AI provider returned an error.", {
            status: response.status,
            providerCode: payload.error?.code ?? null
          });
        }
        const answer = payload.choices?.[0]?.message?.content;
        if (!answer) {
          return providerFailure(fallback, "AI_PROVIDER_EMPTY_RESPONSE", "AI provider returned an empty response.");
        }
        return {
          scene: input.scene,
          type: "model",
          answer,
          bullets: [],
          guidance: null,
          fallback: false,
          model
        };
      } catch (error) {
        if (error.name === "AbortError") {
          return providerFailure(fallback, "AI_PROVIDER_TIMEOUT", "AI provider request timed out.", undefined, 504);
        }
        if (fallback) {
          return providerFallback(fallback, "AI_PROVIDER_UNAVAILABLE", "AI provider request failed.");
        }
        throw error;
      } finally {
        clearTimeout(timeout);
      }
    },

    async *stream(input) {
      const runtime = input.config ?? {};
      const model = providerModel(runtime.model, providerConfig.model);
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), Number(runtime.timeoutMs ?? providerConfig.timeoutMs));
      try {
        const response = await fetchImpl(resolveChatUrl(providerConfig.baseUrl), {
          method: "POST",
          headers: {
            authorization: `Bearer ${providerConfig.apiKey}`,
            "content-type": "application/json",
            accept: "text/event-stream"
          },
          body: JSON.stringify(chatRequestBody(input, runtime, model, { stream: true })),
          signal: controller.signal
        });
        if (!response.ok) {
          const payload = await response.json().catch(() => ({}));
          providerError("AI_PROVIDER_ERROR", "AI provider returned an error.", {
            status: response.status,
            providerCode: payload.error?.code ?? null
          });
        }

        yield { type: "start", model };
        for await (const payload of parseServerSentEvents(response.body)) {
          const content = payload.choices?.map((choice) => choice.delta?.content ?? choice.message?.content ?? "").join("") ?? "";
          if (content) {
            yield { type: "delta", content, model };
          }
        }
      } catch (error) {
        if (error.name === "AbortError") {
          providerError("AI_PROVIDER_TIMEOUT", "AI provider request timed out.", undefined, 504);
        }
        throw error;
      } finally {
        clearTimeout(timeout);
      }
    }
  };
}

function chatRequestBody(input, runtime, model, options = {}) {
  return compactObject({
    model,
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
    max_tokens: Number(runtime.maxTokens ?? 1024),
    stream: options.stream ? true : undefined
  });
}

function normalizeProviderConfig(openai = {}) {
  return {
    baseUrl: emptyToNull(openai.baseUrl),
    apiKey: emptyToNull(openai.apiKey),
    model: providerModel(null, openai.model),
    timeoutMs: Number(openai.timeoutMs ?? 15000)
  };
}

function providerFailure(fallback, code, message, details = undefined, status = 502) {
  return providerFallback(fallback, code, message, details) ?? providerError(code, message, details, status);
}

function providerFallback(fallback, code, message, details = undefined) {
  if (!fallback) {
    return null;
  }
  return {
    ...fallback,
    providerError: {
      code,
      message,
      ...(details === undefined ? {} : { details })
    }
  };
}

function normalizeFallback(fallback, scene) {
  if (!fallback?.answer) {
    return null;
  }
  return {
    scene,
    type: fallback.type ?? "rules",
    answer: fallback.answer,
    bullets: Array.isArray(fallback.bullets) ? fallback.bullets : [],
    guidance: fallback.guidance ?? null,
    fallback: true
  };
}

function providerError(code, message, details = undefined, status = 502) {
  throw new HttpError(status, code, message, details);
}

function providerModel(runtimeModel, configuredModel) {
  const model = String(runtimeModel ?? "").trim();
  if (model && model !== "local-rule-assistant") {
    return model;
  }
  return String(configuredModel ?? "").trim() || "gpt-4.1-mini";
}

function compactObject(value) {
  return Object.fromEntries(Object.entries(value).filter(([, entry]) => entry !== undefined && entry !== null && entry !== ""));
}

function emptyToNull(value) {
  const text = String(value ?? "").trim();
  return text ? text : null;
}

function resolveChatUrl(baseUrl) {
  const url = new URL(baseUrl);
  if (!url.pathname.endsWith("/chat/completions")) {
    url.pathname = `${url.pathname.replace(/\/+$/, "")}/chat/completions`;
  }
  return url;
}

async function* parseServerSentEvents(body) {
  if (!body) {
    return;
  }
  const decoder = new TextDecoder();
  let buffer = "";
  for await (const chunk of responseChunks(body)) {
    buffer += decoder.decode(chunk, { stream: true }).replace(/\r\n/g, "\n");
    let index = buffer.indexOf("\n\n");
    while (index >= 0) {
      const frame = buffer.slice(0, index);
      buffer = buffer.slice(index + 2);
      const payload = parseSseFrame(frame);
      if (payload) {
        yield payload;
      }
      index = buffer.indexOf("\n\n");
    }
  }
  buffer += decoder.decode();
  const payload = parseSseFrame(buffer.replace(/\r\n/g, "\n"));
  if (payload) {
    yield payload;
  }
}

async function* responseChunks(body) {
  if (typeof body.getReader === "function") {
    const reader = body.getReader();
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) {
          return;
        }
        if (value) {
          yield value;
        }
      }
    } finally {
      reader.releaseLock();
    }
    return;
  }
  for await (const chunk of body) {
    yield chunk;
  }
}

function parseSseFrame(frame) {
  const data = String(frame ?? "")
    .split("\n")
    .filter((line) => line.startsWith("data:"))
    .map((line) => line.slice(5).trimStart())
    .join("\n")
    .trim();
  if (!data || data === "[DONE]") {
    return null;
  }
  return JSON.parse(data);
}

function systemPrompt(scene) {
  return [
    "你是邻帮平台的 AI 助手。",
    "你只能回答规则、整理摘要、辅助筛选和生成草稿。",
    "不得自动接单、确认订单、结算、退款、裁决纠纷或封禁用户。",
    `当前场景: ${scene}`
  ].join("\n");
}
