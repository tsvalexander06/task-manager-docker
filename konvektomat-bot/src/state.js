// ─────────────────────────────────────────────────────────────────────────────
// State / памет
// ─────────────────────────────────────────────────────────────────────────────
// In-memory имплементация за старт. Целият достъп до данните минава през
// функциите по-долу, така че замяната с истинска база (SQLite/Postgres/Redis)
// означава да се пренапишат само тези функции, без да се пипа останалият код.
//
// ⚠️ ВАЖНО: при рестарт на процеса in-memory състоянието се губи. За продукция
//    замени Map-овете със SQLite (виж README → "Разширяване към база").

import { randomUUID } from 'node:crypto';

// clientKey = `${channel}:${clientId}`  (напр. "tg:12345" или "wa:359888123456")
// history стойност: масив от { role: 'user' | 'assistant', content: string }
const histories = new Map();

// Чакащи драфтове за одобрение: reviewId -> { channel, clientId, draft, operatorMessageId }
const pendingDrafts = new Map();

// Контекст за reply на оператора: operatorPromptMessageId -> contextObject
// Свързва съобщение, на което операторът трябва да отговори (reply), със
// съответното действие. Примери за contextObject:
//   { type: 'rewrite', channel, clientId }  — пренаписване на отговор за клиент
//   { type: 'setprompt' }                   — задаване на нов системен промпт
const operatorReplyContexts = new Map();

const MAX_HISTORY = 40; // пазим последните N реплики на клиент, за да не расте безкрай

// ── История на разговора ─────────────────────────────────────────────────────

export function getHistory(channel, clientId) {
  return histories.get(key(channel, clientId)) ?? [];
}

export function appendUserMessage(channel, clientId, text) {
  pushMessage(channel, clientId, { role: 'user', content: text });
}

export function appendAssistantMessage(channel, clientId, text) {
  pushMessage(channel, clientId, { role: 'assistant', content: text });
}

function pushMessage(channel, clientId, message) {
  const k = key(channel, clientId);
  const hist = histories.get(k) ?? [];
  hist.push(message);
  // Тримваме старите реплики, запазвайки реда
  if (hist.length > MAX_HISTORY) hist.splice(0, hist.length - MAX_HISTORY);
  histories.set(k, hist);
}

// ── Чакащи драфтове ──────────────────────────────────────────────────────────

/**
 * Записва драфт, който чака одобрение. Връща кратък reviewId, който слагаме в
 * callback data на inline бутоните.
 */
export function createPendingDraft(channel, clientId, draft) {
  const reviewId = randomUUID().slice(0, 8);
  pendingDrafts.set(reviewId, { channel, clientId, draft, operatorMessageId: null });
  return reviewId;
}

export function getPendingDraft(reviewId) {
  return pendingDrafts.get(reviewId) ?? null;
}

export function setDraftOperatorMessage(reviewId, operatorMessageId) {
  const d = pendingDrafts.get(reviewId);
  if (d) d.operatorMessageId = operatorMessageId;
}

export function deletePendingDraft(reviewId) {
  pendingDrafts.delete(reviewId);
}

// ── Контекст за reply на оператора ───────────────────────────────────────────

export function setOperatorReplyContext(operatorPromptMessageId, contextObject) {
  operatorReplyContexts.set(operatorPromptMessageId, contextObject);
}

export function getOperatorReplyContext(operatorPromptMessageId) {
  return operatorReplyContexts.get(operatorPromptMessageId) ?? null;
}

export function deleteOperatorReplyContext(operatorPromptMessageId) {
  operatorReplyContexts.delete(operatorPromptMessageId);
}

// ── Помощни ──────────────────────────────────────────────────────────────────

function key(channel, clientId) {
  return `${channel}:${clientId}`;
}
