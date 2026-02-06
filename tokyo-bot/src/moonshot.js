import OpenAI from 'openai';

const DEFAULT_MOONSHOT_BASE_URL = 'https://api.moonshot.ai/v1';
const DEFAULT_MOONSHOT_MODEL = 'kimi-k2.5';

export const resolveMoonshotConfig = (env = process.env) => {
  const apiKey = env.MOONSHOT_API_KEY || env.OPENAI_API_KEY || env.CODEX_API_KEY;
  if (!apiKey) {
    throw new Error('Missing MOONSHOT_API_KEY (or OPENAI_API_KEY/CODEX_API_KEY fallback)');
  }
  return {
    apiKey,
    baseURL: env.MOONSHOT_BASE_URL || DEFAULT_MOONSHOT_BASE_URL,
    model: env.MOONSHOT_MODEL || DEFAULT_MOONSHOT_MODEL
  };
};

export const createMoonshotRuntime = (env = process.env) => {
  const config = resolveMoonshotConfig(env);
  const client = new OpenAI({
    apiKey: config.apiKey,
    baseURL: config.baseURL
  });
  return { config, client };
};

const getCompletionText = (messageContent) => {
  if (typeof messageContent === 'string') {
    return messageContent.trim();
  }
  if (Array.isArray(messageContent)) {
    return messageContent
      .map((part) => (typeof part?.text === 'string' ? part.text : ''))
      .join('')
      .trim();
  }
  return '';
};

const normalizeMoonshotError = (err) => {
  const status = err?.status;
  const apiMessage = err?.error?.message || err?.message || 'Error desconocido';
  if (status) {
    return `Moonshot API (${status}): ${apiMessage}`;
  }
  return `Moonshot API: ${apiMessage}`;
};

export const runMoonshotPrompt = async ({ runtime, prompt, chatId = 'n/a', logger }) => {
  if (logger?.debug) {
    logger.debug(
      { chatId, model: runtime.config.model, baseURL: runtime.config.baseURL },
      'Ejecutando prompt con OpenAI SDK'
    );
  }
  try {
    const completion = await runtime.client.chat.completions.create({
      model: runtime.config.model,
      temperature: 1,
      messages: [{ role: 'user', content: prompt }]
    });
    return getCompletionText(completion?.choices?.[0]?.message?.content);
  } catch (err) {
    throw new Error(normalizeMoonshotError(err));
  }
};
