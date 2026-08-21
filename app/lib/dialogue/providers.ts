import { DIALOGUE_TEXT_FORMAT, DIALOGUE_TURN_SCHEMA } from "./contracts.ts";

export const MODEL_PROVIDERS = ["kimi", "deepseek", "openai"] as const;
export type ModelProvider = (typeof MODEL_PROVIDERS)[number];

export interface ProviderConfiguration {
  provider: ModelProvider;
  apiKey?: string;
  model?: string;
  baseUrl?: string;
}

export interface ProviderRequest {
  url: string;
  body: Record<string, unknown>;
}

interface ChatCompletionBody {
  choices?: Array<{
    finish_reason?: string | null;
    message?: { content?: string | null; refusal?: string | null };
  }>;
  error?: { message?: string };
}

interface OpenAIResponseContent {
  type?: string;
  text?: string;
  refusal?: string;
}

interface OpenAIResponseBody {
  output_text?: string;
  output?: Array<{ type?: string; content?: OpenAIResponseContent[] }>;
  error?: { message?: string };
}

export interface ProviderResponseExtraction {
  text: string;
  refusal?: string;
  finishReason?: string | null;
}

const DEFAULT_BASE_URLS: Record<ModelProvider, string> = {
  kimi: "https://api.moonshot.cn/v1",
  deepseek: "https://api.deepseek.com",
  openai: "https://api.openai.com/v1",
};

function withoutTrailingSlash(value: string): string {
  return value.replace(/\/+$/, "");
}

export function buildOpenAIRequestBody(model: string, system: string, user: string) {
  return {
    model,
    input: [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
    text: { format: DIALOGUE_TEXT_FORMAT },
  };
}

export function buildChatCompletionRequestBody(
  provider: "kimi" | "deepseek",
  model: string,
  system: string,
  user: string,
) {
  const common: Record<string, unknown> = {
    model,
    messages: [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
    stream: false,
  };

  if (provider === "kimi") {
    common.max_completion_tokens = 1800;
    common.thinking = { type: "disabled" };
    common.response_format = {
      type: "json_schema",
      json_schema: {
        name: "unfinished_table_dialogue_turn",
        strict: true,
        schema: DIALOGUE_TURN_SCHEMA,
      },
    };
  } else {
    common.max_tokens = 1800;
    common.response_format = { type: "json_object" };
  }

  return common;
}

export function buildProviderRequest(
  configuration: Required<Pick<ProviderConfiguration, "provider" | "model">> & Pick<ProviderConfiguration, "baseUrl">,
  system: string,
  user: string,
): ProviderRequest {
  const baseUrl = withoutTrailingSlash(configuration.baseUrl || DEFAULT_BASE_URLS[configuration.provider]);
  if (configuration.provider === "openai") {
    return {
      url: `${baseUrl}/responses`,
      body: buildOpenAIRequestBody(configuration.model, system, user),
    };
  }

  return {
    url: `${baseUrl}/chat/completions`,
    body: buildChatCompletionRequestBody(configuration.provider, configuration.model, system, user),
  };
}

export function extractProviderResponse(provider: ModelProvider, rawBody: unknown): ProviderResponseExtraction {
  if (typeof rawBody !== "object" || rawBody === null) return { text: "" };

  if (provider === "openai") {
    const body = rawBody as OpenAIResponseBody;
    if (typeof body.output_text === "string") return { text: body.output_text };
    const parts: string[] = [];
    for (const item of body.output ?? []) {
      for (const content of item.content ?? []) {
        if (content.type === "refusal") return { text: "", refusal: content.refusal || "模型拒绝了本轮生成" };
        if (content.type === "output_text" && typeof content.text === "string") parts.push(content.text);
      }
    }
    return { text: parts.join("") };
  }

  const body = rawBody as ChatCompletionBody;
  const first = body.choices?.[0];
  if (first?.finish_reason === "content_filter") {
    return { text: "", refusal: first.message?.refusal || "模型因内容检查拒绝了本轮生成", finishReason: first.finish_reason };
  }
  return {
    text: typeof first?.message?.content === "string" ? first.message.content : "",
    refusal: first?.message?.refusal || undefined,
    finishReason: first?.finish_reason,
  };
}

export function extractProviderError(rawBody: unknown): string | undefined {
  if (typeof rawBody !== "object" || rawBody === null) return undefined;
  const message = (rawBody as { error?: { message?: unknown } }).error?.message;
  return typeof message === "string" ? message : undefined;
}

export function resolveServerModelConfiguration(environment: Record<string, string | undefined>): ProviderConfiguration {
  const requested = environment.AI_PROVIDER?.toLowerCase();
  const provider: ModelProvider = MODEL_PROVIDERS.includes(requested as ModelProvider)
    ? requested as ModelProvider
    : environment.MOONSHOT_API_KEY
      ? "kimi"
      : environment.DEEPSEEK_API_KEY
        ? "deepseek"
        : environment.OPENAI_API_KEY
          ? "openai"
          : "kimi";

  if (provider === "kimi") {
    return {
      provider,
      apiKey: environment.MOONSHOT_API_KEY,
      model: environment.KIMI_MODEL || "kimi-k2.6",
      baseUrl: environment.KIMI_BASE_URL || DEFAULT_BASE_URLS.kimi,
    };
  }
  if (provider === "deepseek") {
    return {
      provider,
      apiKey: environment.DEEPSEEK_API_KEY,
      model: environment.DEEPSEEK_MODEL || "deepseek-v4-pro",
      baseUrl: environment.DEEPSEEK_BASE_URL || DEFAULT_BASE_URLS.deepseek,
    };
  }
  return {
    provider,
    apiKey: environment.OPENAI_API_KEY,
    model: environment.OPENAI_MODEL,
    baseUrl: environment.OPENAI_BASE_URL || DEFAULT_BASE_URLS.openai,
  };
}
