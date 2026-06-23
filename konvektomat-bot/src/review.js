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
    state.setRewriteContext(promptMessageId, pending.channel, pending.clientId);
    // Драфтът остава чакащ — операторът може и да реши все пак да го прати по-късно.
    await safeAnswer(ctx, '✏️ Чакам новия текст (reply на съобщението).');
    await markHandled(ctx, '✏️ В процес на пренаписване');
  } else {
    await safeAnswer(ctx, '❌ Не успях да започна пренаписване.');
  }
}

// ── 3b) Оператор отговори (reply) с нов текст ────────────────────────────────

/**
 * Връща true, ако reply-ът е бил активна заявка за пренаписване и е обработен.
 */
export async function handleRewriteReply(promptMessageId, text) {
  const ctxData = state.getRewriteContext(promptMessageId);
  if (!ctxData) return false; // не е reply на наш rewrite prompt

  const { channel, clientId } = ctxData;
  const ok = await deliverToClient(channel, clientId, text);

  if (ok) {
    state.appendAssistantMessage(channel, clientId, text);
    state.deleteRewriteContext(promptMessageId);
    await telegram.notifyOperator(`✅ Коригираният отговор е изпратен на клиент ${clientId}.`);
  } else {
    await telegram.notifyOperator(`❌ Изпращането на коригирания отговор до ${clientId} се провали.`);
  }
  return true;
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
