// ─────────────────────────────────────────────────────────────────────────────
// Telegram
// ─────────────────────────────────────────────────────────────────────────────
// Този модул прави две неща:
//   1) Приема съобщения от клиенти, които пишат на бота в Telegram.
//   2) Предоставя операторския интерфейс за преглед: праща драфтовете в личния
//      чат на оператора с inline бутони "✅ Send" / "✏️ Rewrite" и хваща reply-а
//      при пренаписване.
//
// Модулът НЕ знае нищо за бизнес логиката — получава я чрез setHandlers(),
// за да няма кръгови зависимости (telegram → review). index.js свързва двете.

import { Telegraf, Markup } from 'telegraf';
import { config } from '../config.js';
import { log } from '../logger.js';

export const bot = new Telegraf(config.telegram.botToken);

const OPERATOR = config.telegram.operatorChatId;

// Инжектирани от index.js (всъщност препращат към review.js)
let handlers = {
  // (channel, clientId, text) -> Promise<void>  — нов клиентски въпрос
  onClientMessage: async () => {},
  // (reviewId, ctx) -> Promise<void>            — натиснат "Send"
  onApprove: async () => {},
  // (reviewId, ctx) -> Promise<void>            — натиснат "Rewrite"
  onRewriteRequest: async () => {},
  // (promptMessageId, text) -> Promise<boolean> — reply на оператора с нов текст
  onRewriteReply: async () => false,
};

export function setHandlers(next) {
  handlers = { ...handlers, ...next };
}

// ── Изпращане към клиент по Telegram ─────────────────────────────────────────

export async function sendToClient(clientId, text) {
  try {
    await bot.telegram.sendMessage(clientId, text);
    return true;
  } catch (err) {
    log.error(`Telegram send към клиент ${clientId} се провали:`, err?.message ?? err);
    return false;
  }
}

// ── Операторски интерфейс ────────────────────────────────────────────────────

/**
 * Праща драфт в чата на оператора с inline бутони.
 * Callback data кодира канала и reviewId, така че бутонът знае обратно по кой
 * канал и към кой клиент да върне отговора (clientId се пази в state по reviewId).
 * Връща message_id на изпратеното съобщение (или null при грешка).
 */
export async function sendDraftToOperator({ channel, clientId, draft, reviewId }) {
  const header =
    `📨 Ново съобщение — канал: *${channel.toUpperCase()}*, клиент: \`${clientId}\`\n\n` +
    `✍️ *Драфт отговор:*\n${draft}`;

  const keyboard = Markup.inlineKeyboard([
    Markup.button.callback('✅ Send', `send_${channel}_${reviewId}`),
    Markup.button.callback('✏️ Rewrite', `rw_${channel}_${reviewId}`),
  ]);

  try {
    const sent = await bot.telegram.sendMessage(OPERATOR, header, {
      parse_mode: 'Markdown',
      ...keyboard,
    });
    return sent.message_id;
  } catch (err) {
    // Ако Markdown-ът счупи рендиране (напр. спец. символи в драфта), пробваме без него.
    log.warn('Изпращане на драфт с Markdown се провали, опитвам plain text.', err?.message);
    try {
      const sent = await bot.telegram.sendMessage(
        OPERATOR,
        `📨 ${channel.toUpperCase()} | клиент ${clientId}\n\nДрафт:\n${draft}`,
        keyboard,
      );
      return sent.message_id;
    } catch (err2) {
      log.error('Изпращане на драфт към оператора напълно се провали:', err2?.message ?? err2);
      return null;
    }
  }
}

/**
 * Уведомява оператора, че Claude не е успял да генерира драфт.
 */
export async function notifyOperator(text) {
  try {
    await bot.telegram.sendMessage(OPERATOR, text);
  } catch (err) {
    log.error('Не успях да уведомя оператора:', err?.message ?? err);
  }
}

/**
 * Праща съобщение "напиши новия отговор за клиент X" с force_reply, за да може
 * операторът да отговори (reply) и ние да хванем точно този reply.
 * Връща message_id на prompt-а (или null).
 */
export async function askForRewrite({ channel, clientId }) {
  try {
    const sent = await bot.telegram.sendMessage(
      OPERATOR,
      `✏️ Напиши новия отговор за клиент \`${clientId}\` (канал ${channel.toUpperCase()}).\n` +
        `↩️ Отговори (reply) на това съобщение с коригирания текст.`,
      { parse_mode: 'Markdown', reply_markup: { force_reply: true, selective: true } },
    );
    return sent.message_id;
  } catch (err) {
    log.error('askForRewrite се провали:', err?.message ?? err);
    return null;
  }
}

// ── Регистриране на handler-и ────────────────────────────────────────────────

function registerHandlers() {
  // Callback от inline бутоните.
  bot.on('callback_query', async (ctx) => {
    const data = ctx.callbackQuery.data ?? '';
    try {
      // Формат: send_<channel>_<reviewId>  или  rw_<channel>_<reviewId>
      const sendMatch = data.match(/^send_(tg|wa)_(.+)$/);
      const rwMatch = data.match(/^rw_(tg|wa)_(.+)$/);

      if (sendMatch) {
        const reviewId = sendMatch[2];
        await handlers.onApprove(reviewId, ctx);
      } else if (rwMatch) {
        const reviewId = rwMatch[2];
        await handlers.onRewriteRequest(reviewId, ctx);
      } else {
        await ctx.answerCbQuery('Неразпозната команда.');
      }
    } catch (err) {
      log.error('Грешка при обработка на callback:', err?.message ?? err);
      try {
        await ctx.answerCbQuery('Възникна грешка.');
      } catch {
        /* ignore */
      }
    }
  });

  // Текстови съобщения.
  bot.on('text', async (ctx) => {
    const chatId = String(ctx.chat.id);
    const text = ctx.message.text?.trim();
    if (!text) return;

    try {
      if (chatId === OPERATOR) {
        // Съобщение от оператора. Интересува ни само ако е REPLY на rewrite prompt.
        const replyTo = ctx.message.reply_to_message?.message_id;
        if (replyTo) {
          const handled = await handlers.onRewriteReply(replyTo, text);
          if (!handled) {
            await ctx.reply('ℹ️ Това не изглежда като активна заявка за пренаписване.');
          }
        }
        // Ако операторът просто пише (не reply) — игнорираме.
        return;
      }

      // Иначе: съобщение от клиент в Telegram.
      log.info(`Telegram ← клиент ${chatId}: ${text}`);
      await handlers.onClientMessage('tg', chatId, text);
    } catch (err) {
      log.error('Грешка при обработка на Telegram съобщение:', err?.message ?? err);
    }
  });
}

/**
 * Стартира бота в polling режим (най-лесно за старт; виж README за webhook).
 */
export async function start() {
  registerHandlers();
  await bot.launch();
  log.info('Telegram бот стартиран (polling).');
}
