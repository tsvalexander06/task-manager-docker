require("dotenv").config();
const fs = require("fs");
const os = require("os");
const path = require("path");
const { Telegraf } = require("telegraf");

const { identifyFromPhotos } = require("./vision");
const { enrichWithWebSearch } = require("./research");
const { buildDescription } = require("./template");
const { postListing } = require("./olx");

const bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN);

// Per-chat session: { photos: [{base64, mediaType, filePath}], item, draft, state }
const sessions = new Map();

function getSession(chatId) {
  if (!sessions.has(chatId)) {
    sessions.set(chatId, { photos: [], item: null, draft: null, state: "collecting" });
  }
  return sessions.get(chatId);
}

function resetSession(chatId) {
  sessions.delete(chatId);
}

bot.start((ctx) =>
  ctx.reply(
    "Изпрати снимки на машината (можеш няколко), после напиши /done.\n" +
      "Send photos of the machine, then send /done when finished."
  )
);

bot.command("cancel", (ctx) => {
  resetSession(ctx.chat.id);
  ctx.reply("Отказано. Можеш да изпратиш нови снимки.");
});

bot.on("photo", async (ctx) => {
  const session = getSession(ctx.chat.id);
  if (session.state !== "collecting") {
    return ctx.reply("Вече обработвам тази обява. Напиши /cancel за да започнеш отначало.");
  }

  const photo = ctx.message.photo[ctx.message.photo.length - 1];
  const fileLink = await ctx.telegram.getFileLink(photo.file_id);
  const res = await fetch(fileLink.href);
  const buffer = Buffer.from(await res.arrayBuffer());

  const tmpPath = path.join(os.tmpdir(), `${photo.file_id}.jpg`);
  fs.writeFileSync(tmpPath, buffer);

  session.photos.push({
    base64: buffer.toString("base64"),
    mediaType: "image/jpeg",
    filePath: tmpPath,
  });

  ctx.reply(`Снимка получена (${session.photos.length}). Изпрати още или напиши /done.`);
});

bot.command("done", async (ctx) => {
  const session = getSession(ctx.chat.id);
  if (session.photos.length === 0) {
    return ctx.reply("Първо изпрати поне една снимка.");
  }
  session.state = "processing";
  await ctx.reply("Анализирам снимките...");

  try {
    let item = await identifyFromPhotos(session.photos);
    await ctx.reply("Търся допълнителна информация онлайн...");
    item = await enrichWithWebSearch(item);

    session.item = item;
    session.state = "awaiting_price";

    const summary = Object.entries(item)
      .map(([k, v]) => `${k}: ${v ?? "—"}`)
      .join("\n");
    await ctx.reply(`Разпознато:\n${summary}\n\nИзпрати цена (само число, лв).`);
  } catch (err) {
    console.error(err);
    session.state = "collecting";
    await ctx.reply("Грешка при анализа. Опитай отново или /cancel.");
  }
});

bot.on("text", async (ctx) => {
  const session = getSession(ctx.chat.id);
  const text = ctx.message.text.trim();

  if (session.state === "awaiting_price") {
    const price = Number(text.replace(/[^\d.]/g, ""));
    if (!price) {
      return ctx.reply("Моля изпрати валидна цена (число).");
    }

    session.draft = buildDescription(session.item, price);
    session.state = "awaiting_confirm";

    await ctx.reply(
      `Чернова на обявата:\n\n` +
        `Заглавие: ${session.draft.title}\n\n${session.draft.description}\n\nЦена: ${price} лв\n\n` +
        `Изпрати "да" за публикуване в OLX или /cancel за отказ.`
    );
    return;
  }

  if (session.state === "awaiting_confirm") {
    if (!/^да$/i.test(text)) {
      return ctx.reply('Изпрати "да" за публикуване или /cancel за отказ.');
    }

    await ctx.reply("Публикувам в OLX...");
    try {
      const result = await postListing({
        title: session.draft.title,
        description: session.draft.description,
        price: session.draft.price,
        photoPaths: session.photos.map((p) => p.filePath),
      });
      await ctx.reply(`Готово! ${result.url}`);
    } catch (err) {
      console.error(err);
      await ctx.reply(
        "Грешка при публикуването в OLX. Вероятно структурата на сайта изисква " +
          "обновяване на селекторите в src/olx.js."
      );
    } finally {
      for (const p of session.photos) {
        fs.unlink(p.filePath, () => {});
      }
      resetSession(ctx.chat.id);
    }
    return;
  }
});

bot.launch();
console.log("OLX listing bot started.");

process.once("SIGINT", () => bot.stop("SIGINT"));
process.once("SIGTERM", () => bot.stop("SIGTERM"));
