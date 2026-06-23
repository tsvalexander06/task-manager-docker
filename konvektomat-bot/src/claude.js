// ─────────────────────────────────────────────────────────────────────────────
// Claude (Anthropic) интеграция
// ─────────────────────────────────────────────────────────────────────────────
// Генерира черновa отговор на български въз основа на системния промпт и
// историята на разговора с конкретния клиент.

import Anthropic from '@anthropic-ai/sdk';
import { config } from './config.js';
import { log } from './logger.js';
import { getActivePrompt } from './prompt.js';

const client = new Anthropic({ apiKey: config.claude.apiKey });

/**
 * Връща черновa отговор (string) за дадена история на разговора.
 * history: масив от { role: 'user' | 'assistant', content: string }
 *
 * Робастно: при грешка от Claude или празен отговор връща null, за да може
 * извикващият да реши какво да прави, без целият бот да се чупи.
 */
export async function generateDraft(history) {
  // Подсигуряваме, че историята започва с 'user' и не е празна.
  const messages = normalizeHistory(history);
  if (messages.length === 0) {
    log.warn('Празна история — пропускам генериране на драфт.');
    return null;
  }

  try {
    const response = await client.messages.create({
      model: config.claude.model,
      max_tokens: config.claude.maxTokens,
      // Четем активния промпт при всяка заявка → живата редакция важи веднага.
      system: getActivePrompt(),
      messages,
    });

    // Извличаме само текстовите блокове.
    const text = response.content
      .filter((block) => block.type === 'text')
      .map((block) => block.text)
      .join('\n')
      .trim();

    if (!text) {
      log.warn('Claude върна празен текст.', { stop_reason: response.stop_reason });
      return null;
    }
    return text;
  } catch (err) {
    log.error('Грешка при заявка към Claude:', err?.message ?? err);
    return null;
  }
}

/**
 * Anthropic API изисква първото съобщение да е с роля 'user' и ролите да се
 * редуват логично. Тук подсигуряваме това, без да чупим при странна история.
 */
function normalizeHistory(history) {
  const cleaned = (history ?? []).filter(
    (m) => m && typeof m.content === 'string' && m.content.trim().length > 0,
  );
  // Махаме водещи assistant съобщения, докато първото стане 'user'.
  while (cleaned.length && cleaned[0].role !== 'user') cleaned.shift();
  return cleaned.map((m) => ({ role: m.role, content: m.content }));
}
