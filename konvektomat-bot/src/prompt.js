// ─────────────────────────────────────────────────────────────────────────────
// Системен промпт — зареждане + жива редакция
// ─────────────────────────────────────────────────────────────────────────────
// Източници, по приоритет:
//   1. Жив override, зададен по време на работа през Telegram (/setprompt)
//   2. env променлива SYSTEM_PROMPT
//   3. файл src/system-prompt.md
//   4. резервен текст
//
// ⚠️ Живият override живее в паметта — губи се при рестарт/redeploy на Railway.
//    Той е за БЪРЗ ЕКСПЕРИМЕНТ. Когато си доволен от текста, копирай го в Railway
//    → Variables → SYSTEM_PROMPT, за да остане завинаги.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { config } from './config.js';
import { log } from './logger.js';

let override = null; // жив текст, зададен през Telegram

const base = loadBase();

function loadBase() {
  if (config.systemPromptEnv) {
    return { text: config.systemPromptEnv, source: 'env (SYSTEM_PROMPT)' };
  }
  try {
    const here = dirname(fileURLToPath(import.meta.url));
    const text = readFileSync(join(here, 'system-prompt.md'), 'utf8');
    return { text, source: 'файл system-prompt.md' };
  } catch (err) {
    log.warn('Не успях да заредя system-prompt.md, използвам резервен промпт.', err.message);
    return {
      text: 'Ти си учтив клиентски асистент на konvektomat.store. Отговаряй на български.',
      source: 'резервен (fallback)',
    };
  }
}

/** Активният промпт, който се подава на Claude в момента. */
export function getActivePrompt() {
  return override ?? base.text;
}

/** Текст + откъде идва (за /prompt). */
export function getPromptInfo() {
  return override
    ? { text: override, source: 'жив (зададен през Telegram)' }
    : { text: base.text, source: base.source };
}

/** Задава жив override (използва се веднага за новите драфтове). */
export function setPromptOverride(text) {
  override = text.trim();
  log.info('Системният промпт е сменен на живо през Telegram.');
}

/** Връща се към оригиналния промпт (env или файл). */
export function clearPromptOverride() {
  override = null;
  log.info('Системният промпт е върнат към оригинала.');
}
