// ─────────────────────────────────────────────────────────────────────────────
// Entry point
// ─────────────────────────────────────────────────────────────────────────────
// Стартира:
//   • Express сървър за WhatsApp webhook-а (и health check)
//   • Telegram бота (polling) за клиентски съобщения + операторски преглед
// и свързва всичко през review.js (оркестратора).

import express from 'express';
import { config, assertConfig } from './config.js';
import { log } from './logger.js';
import * as telegram from './channels/telegram.js';
import { webhookRouter } from './channels/whatsapp.js';
import * as review from './review.js';

async function main() {
  assertConfig();

  // 1) Свързваме операторските/клиентските handler-и на Telegram с оркестратора.
  telegram.setHandlers({
    onClientMessage: review.handleIncomingClientMessage,
    onApprove: review.handleApprove,
    onRewriteRequest: review.handleRewriteRequest,
    onRewriteReply: review.handleRewriteReply,
  });

  // 2) Express + WhatsApp webhook.
  const app = express();
  app.use(express.json());

  // Health check (полезно за Railway/Render).
  app.get('/', (_req, res) => res.send('konvektomat-bot е жив ✅'));

  // WhatsApp входящите съобщения отиват към същия оркестратор, канал 'wa'.
  app.use(
    '/webhook/whatsapp',
    webhookRouter({
      onMessage: (from, text) => review.handleIncomingClientMessage('wa', from, text),
    }),
  );

  app.listen(config.server.port, () => {
    log.info(`HTTP сървър слуша на порт ${config.server.port}.`);
    log.info(`WhatsApp webhook: /webhook/whatsapp`);
  });

  // 3) Telegram (polling).
  await telegram.start();

  log.info(`Готово. Модел: ${config.claude.model}. Оператор: ${config.telegram.operatorChatId}.`);
}

// Грациозно спиране.
process.once('SIGINT', () => {
  log.info('SIGINT — спирам.');
  telegram.bot.stop('SIGINT');
  process.exit(0);
});
process.once('SIGTERM', () => {
  log.info('SIGTERM — спирам.');
  telegram.bot.stop('SIGTERM');
  process.exit(0);
});

main().catch((err) => {
  log.error('Фатална грешка при старт:', err?.message ?? err);
  process.exit(1);
});
