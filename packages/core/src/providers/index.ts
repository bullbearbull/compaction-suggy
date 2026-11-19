import type { DecisionProvider, TopicShiftConfig } from "../types.js";
import { LocalDecisionProvider } from "./local-systemone.js";
import { OpenAiLunaProvider } from "./openai-luna.js";
import { OpenRouterJevProvider } from "./openrouter-jev.js";

export { OpenRouterJevProvider } from "./openrouter-jev.js";
export { OpenAiLunaProvider } from "./openai-luna.js";
export { LocalDecisionProvider } from "./local-systemone.js";

export interface ResolveProviderOptions {
  fetchImpl?: typeof fetch;
}

export function resolveDecisionProvider(
  config: TopicShiftConfig,
  options: ResolveProviderOptions = {},
): DecisionProvider | undefined {
  const fetchImpl = options.fetchImpl;

  const createOpenRouter = (): DecisionProvider | undefined => {
    if (!config.openrouter.apiKey) return undefined;
    return new OpenRouterJevProvider({
      apiKey: config.openrouter.apiKey,
      model: config.model || config.openrouter.model,
      baseUrl: config.openrouter.baseUrl,
      referer: config.openrouter.referer,
      title: config.openrouter.title,
      fetchImpl,
    });
  };

  const createOpenAi = (): DecisionProvider | undefined => {
    if (!config.openai.apiKey) return undefined;
    return new OpenAiLunaProvider({
      apiKey: config.openai.apiKey,
      model: config.model || config.openai.model,
      baseUrl: config.openai.baseUrl,
      fetchImpl,
    });
  };

  const createLocal = (): DecisionProvider | undefined => {
    if (!config.local.url) return undefined;
    return new LocalDecisionProvider({
      url: config.local.url,
      model: config.model || config.local.model,
      apiFormat: config.local.apiFormat,
      apiKey: config.local.apiKey,
      keepAlive: config.local.keepAlive,
      fetchImpl,
    });
  };

  switch (config.provider) {
    case "openrouter":
      return createOpenRouter();
    case "openai":
      return createOpenAi();
    case "local":
      return createLocal();
    case "auto":
      return createOpenRouter() ?? createOpenAi() ?? createLocal();
  }
}
