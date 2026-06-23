// ─────────────────────────────────────────────────────────────────────────────
// Review / оркестрация (human-in-the-loop)
// ─────────────────────────────────────────────────────────────────────────────
// Свързва каналите (Telegram/WhatsApp), Claude и state-а. Това е "мозъкът":
//   1. Клиент пише → пазим съобщението → Claude прави драфт → пращаме на оператора.
//   2. Оператор натиска "Send" → пращаме драфта на клиента непроменен.
//   3. Оператор натиска "Rewrite" → искаме нов текст → при reply пращаме него.

import { generateDraft } from './claude.js';
import * as state from './state.js';
import * as telegram from './channels/telegram.js';
import * as whatsapp from './channels/whatsapp.js';
import * as prompt from './prompt.js';
import { log } from './logger.js';

// ── 1) Входящо клиентско съобщение ───────────────────────────────────────────

export async function handleIncomingClientMessage(channel, clientId, text) {
  if (!text || !text.trim()) return; // празни съобщения игнорираме

  // Записваме репликата на клиента в историята.
  state.appendUserMessage(channel, clientId, text);

  // Генерираме драфт от Claude.
  const draft = await generateDraft(state.getHistory(channel, clientId));

  if (!draft) {
    // Claude гръмна или върна празно — не чупим бота, само уведомяваме оператора,
    // за да отговори ръчно.
    await telegram.notifyOperator(
      `⚠️ Claude не успя да генерира драфт за клиент ${clientId} (${channel.toUpperCase()}).\n` +
        `Последно съобщение от клиента:\n"${text}"\n\n` +
        `Можеш да отговориш ръчно през администраторския панел/директно.`,
    );
    return;
  }

  // Пазим драфта като чакащ за одобрение и го пращаме на оператора с бутони.
  const reviewId = state.createPendingDraft(channel, clientId, draft);
  const operatorMessageId = await telegram.sendDraftToOperator({
    channel,
    clientId,
    draft,
    reviewId,
  });
  if (operatorMessageId) {
    state.setDraftOperatorMessage(reviewId, operatorMessageId);
  }
}

// ── 2) Оператор натисна "✅ Send" ────────────────────────────────────────────

export async function handleApprove(reviewId, ctx) {
  const pending = state.getPendingDraft(reviewId);
  if (!pending) {
    await safeAnswer(ctx, 'Този драфт вече не е активен.');
    return;
  }

  const ok = await deliverToClient(pending.channel, pending.clientId, pending.draft);

  if (ok) {
    // Записваме одобрения отговор в историята, за да има Claude контекст следващия път.
    state.appendAssistantMessage(pending.channel, pending.clientId, pending.draft);
    state.deletePendingDraft(reviewId);
    await safeAnswer(ctx, '✅ Изпратено на клиента.');
    await markHandled(ctx, '✅ Изпратено непроменено');
  } else {
    await safeAnswer(ctx, '❌ Изпращането към клиента се провали.');
  }
}

// ── 3a) Оператор натисна "✏️ Rewrite" ────────────────────────────────────────

export async function handleRewriteRequest(reviewId, ctx) {
  const pending = state.getPendingDraft(reviewId);
  if (!pending) {
    await safeAnswer(ctx, 'Този драфт вече не е активен.');
    return;
  }

  const promptMessageId = await telegram.askForRewrite({
    channel: pending.channel,
    clientId: pending.clientId,
  });

  if (promptMessageId) {
    // Свързваме prompt-а с клиента/канала, за да хванем reply-а после.
    state.setOperatorReplyContext(promptMessageId, {
      type: 'rewrite',
      channel: pending.channel,
      clientId: pending.clientId,
    });
    // Драфтът остава чакащ — операторът може и да реши все пак да го прати по-късно.
    await safeAnswer(ctx, '✏️ Чакам новия текст (reply на съобщението).');
    await markHandled(ctx, '✏️ В процес на пренаписване');
  } else {
    await safeAnswer(ctx, '❌ Не успях да започна пренаписване.');
  }
}

// ── 3b) Оператор отговори (reply) — общ диспечер по тип контекст ──────────────

/**
 * Извиква се при всеки reply на оператора. Решава какво да прави според типа на
 * контекста, свързан със съобщението, на което се отговаря.
 * Връща true, ако reply-ът е разпознат и обработен.
 */
export async function handleOperatorReply(promptMessageId, text) {
  const ctxData = state.getOperatorReplyContext(promptMessageId);
  if (!ctxData) return false; // не е reply на наше съобщение с очакван отговор

  if (ctxData.type === 'rewrite') {
    const { channel, clientId } = ctxData;
    const ok = await deliverToClient(channel, clientId, text);
    if (ok) {
      state.appendAssistantMessage(channel, clientId, text);
      await telegram.notifyOperator(`✅ Коригираният отговор е изпратен на клиент ${clientId}.`);
    } else {
      await telegram.notifyOperator(`❌ Изпращането на коригирания отговор до ${clientId} се провали.`);
    }
    state.deleteOperatorReplyContext(promptMessageId);
    return true;
  }

  if (ctxData.type === 'setprompt') {
    prompt.setPromptOverride(text);
    state.deleteOperatorReplyContext(promptMessageId);
    await telegram.notifyOperator(
      '✅ Системният промпт е сменен и важи веднага за новите отговори.\n\n' +
        '⚠️ Това важи до следващ рестарт/redeploy. За да остане завинаги, копирай ' +
        'текста в Railway → Variables → SYSTEM_PROMPT.',
    );
    return true;
  }

  return false;
}

// ── Команди за системния промпт (само оператор) ──────────────────────────────

/** /prompt — показва текущия промпт и откъде идва. */
export async function handleShowPrompt(ctx) {
  const info = prompt.getPromptInfo();
  // Telegram реже съобщения над ~4096 символа — режем за по-сигурно.
  const shown = info.text.length > 3500 ? info.text.slice(0, 3500) + '\n…(отрязано)' : info.text;
  await ctx.reply(
    `📋 Текущ системен промпт (източник: ${info.source}):\n\n${shown}\n\n` +
      `За смяна: /setprompt   •   За връщане на оригинала: /resetprompt`,
  );
}

/**
 * /setprompt — иска нов текст. Връща false, ако не е успяло (тогава telegram.js
 * го съобщава). При успех записва контекст за reply-а.
 */
export async function handleSetPromptRequest() {
  const promptMessageId = await telegram.askForPrompt();
  if (!promptMessageId) return false;
  state.setOperatorReplyContext(promptMessageId, { type: 'setprompt' });
  return true;
}

/** /resetprompt — връща оригиналния промпт (env или файл). */
export async function handleResetPrompt(ctx) {
  prompt.clearPromptOverride();
  const info = prompt.getPromptInfo();
  await ctx.reply(`↩️ Върнат е оригиналният промпт (източник: ${info.source}).`);
}

// ── Доставка по правилния канал ──────────────────────────────────────────────

async function deliverToClient(channel, clientId, text) {
  if (channel === 'tg') return telegram.sendToClient(clientId, text);
  if (channel === 'wa') return whatsapp.sendText(clientId, text);
  log.error(`Непознат канал при доставка: ${channel}`);
  return false;
}

// ── Помощни за Telegram callback UI ──────────────────────────────────────────

async function safeAnswer(ctx, text) {
  try {
    await ctx.answerCbQuery(text);
  } catch {
    /* callback може да е изтекъл — игнорираме */
  }
}

// Маха бутоните от съобщението и добавя бележка за статуса.
async function markHandled(ctx, note) {
  try {
    await ctx.editMessageReplyMarkup(); // премахва inline клавиатурата
    const original = ctx.callbackQuery?.message?.text ?? '';
    await ctx.editMessageText(`${original}\n\n— ${note}`);
  } catch {
    /* ако не може да редактира (стар Markdown и т.н.) — не е критично */
  }
}
