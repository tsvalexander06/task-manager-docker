// Зарежда и валидира конфигурацията от .env.
// Всичко чувствително идва от environment променливи — нищо не е хардкоднато.
import 'dotenv/config';

/**
 * Връща стойност от env или хвърля разбираема грешка, ако липсва.
 */
function required(name) {
  const value = process.env[name];
  if (!value || !value.trim()) {
    throw new Error(
      `Липсва задължителна env променлива: ${name}. ` +
        `Виж .env.example и попълни .env файла.`,
    );
  }
  return value.trim();
}

function optional(name, fallback) {
  const value = process.env[name];
  return value && value.trim() ? value.trim() : fallback;
}

export const config = {
  telegram: {
    botToken: required('TELEGRAM_BOT_TOKEN'),
    // chat ID на оператора — всички драфтове отиват тук за преглед
    operatorChatId: String(required('OPERATOR_CHAT_ID')),
  },
  claude: {
    apiKey: required('ANTHROPIC_API_KEY'),
    model: optional('CLAUDE_MODEL', 'claude-sonnet-4-6'),
    maxTokens: parseInt(optional('CLAUDE_MAX_TOKENS', '1024'), 10),
  },
  whatsapp: {
    token: required('WHATSAPP_TOKEN'),
    phoneNumberId: required('WHATSAPP_PHONE_NUMBER_ID'),
    verifyToken: required('WHATSAPP_VERIFY_TOKEN'),
    graphVersion: optional('WHATSAPP_GRAPH_VERSION', 'v21.0'),
  },
  server: {
    port: parseInt(optional('PORT', '3000'), 10),
  },
  // Системният промпт може да дойде от env (приоритет) или от файл (виж claude.js)
  systemPromptEnv: optional('SYSTEM_PROMPT', ''),
};

/**
 * Извиква се при старт — ако нещо липсва, процесът пада веднага с ясно съобщение,
 * вместо да се чупи по-късно при първа заявка.
 */
export function assertConfig() {
  // Достъпът до полетата по-горе вече е извикал required() и би хвърлил.
  // Тук валидираме допълнително числовите стойности.
  if (Number.isNaN(config.claude.maxTokens) || config.claude.maxTokens <= 0) {
    throw new Error('CLAUDE_MAX_TOKENS трябва да е положително число.');
  }
  if (Number.isNaN(config.server.port)) {
    throw new Error('PORT трябва да е число.');
  }
}
