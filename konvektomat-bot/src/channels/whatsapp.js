// ─────────────────────────────────────────────────────────────────────────────
// WhatsApp Cloud API (Meta / graph.facebook.com)
// ─────────────────────────────────────────────────────────────────────────────
// Праща съобщения чрез директни HTTP заявки към Graph API и предоставя Express
// router с двата нужни endpoint-а:
//   GET  /webhook/whatsapp  → verification (Meta проверява verify token)
//   POST /webhook/whatsapp  → входящи съобщения + status callback-и
//
// ⚠️ 24-ЧАСОВ ПРОЗОРЕЦ: WhatsApp позволява свободни (free-form) отговори само в
//    рамките на 24ч след последното съобщение на клиента. След това се изискват
//    одобрени template съобщения. Виж README.

import express from 'express';
import { config } from '../config.js';
import { log } from '../logger.js';

const GRAPH_BASE = `https://graph.facebook.com/${config.whatsapp.graphVersion}`;

/**
 * Праща текстово съобщение на клиент по WhatsApp.
 * to: телефонен номер на клиента (във формат, който Meta връща, напр. 359888123456)
 */
export async function sendText(to, text) {
  const url = `${GRAPH_BASE}/${config.whatsapp.phoneNumberId}/messages`;
  const payload = {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to,
    type: 'text',
    text: { preview_url: false, body: text },
  };

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${config.whatsapp.token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const body = await res.text();
      log.error(`WhatsApp send неуспешен (${res.status}):`, body);
      return false;
    }
    return true;
  } catch (err) {
    log.error('WhatsApp send хвърли грешка:', err?.message ?? err);
    return false;
  }
}

/**
 * Връща Express router за WhatsApp webhook-а.
 * onMessage(from, text) се извиква за всяко ВХОДЯЩО текстово съобщение.
 */
export function webhookRouter({ onMessage }) {
  const router = express.Router();

  // 1) Verification handshake — Meta вика този endpoint при настройка на webhook.
  router.get('/', (req, res) => {
    const mode = req.query['hub.mode'];
    const token = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];

    if (mode === 'subscribe' && token === config.whatsapp.verifyToken) {
      log.info('WhatsApp webhook верифициран успешно.');
      return res.status(200).send(challenge);
    }
    log.warn('WhatsApp webhook верификация се провали (грешен verify token?).');
    return res.sendStatus(403);
  });

  // 2) Входящи събития — съобщения и status callback-и.
  router.post('/', async (req, res) => {
    // Винаги отговаряме 200 бързо, за да не препраща Meta (retry storm).
    res.sendStatus(200);

    try {
      const messages = extractIncomingMessages(req.body);
      for (const msg of messages) {
        // Обработваме само текстови съобщения; другите типове логваме и пропускаме.
        if (msg.type !== 'text') {
          log.info(`WhatsApp: пропуснат неподдържан тип съобщение "${msg.type}" от ${msg.from}`);
          continue;
        }
        const text = msg.text?.body?.trim();
        if (!text) continue;
        log.info(`WhatsApp ← ${msg.from}: ${text}`);
        await onMessage(msg.from, text);
      }
    } catch (err) {
      // Не позволяваме грешка тук да събори процеса.
      log.error('Грешка при обработка на WhatsApp webhook:', err?.message ?? err);
    }
  });

  return router;
}

/**
 * Изважда входящите съобщения от payload-а на Meta и ИГНОРИРА status callback-ите
 * (delivered / read / sent), които нямат "messages" поле.
 */
function extractIncomingMessages(body) {
  const out = [];
  const entries = body?.entry ?? [];
  for (const entry of entries) {
    for (const change of entry.changes ?? []) {
      const value = change.value ?? {};
      // status callback-ите идват в value.statuses — нямат value.messages
      if (Array.isArray(value.messages)) {
        out.push(...value.messages);
      }
    }
  }
  return out;
}
