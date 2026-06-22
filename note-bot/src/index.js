require("dotenv").config();
const fs = require("fs");
const path = require("path");
const { Telegraf, Markup } = require("telegraf");
const { analyzeNote } = require("./analyze");
const {
  createTask,
  listTasks,
  updateTask,
  updateTaskStatus,
  listWorkers,
  createWorker
} = require("./backend");
const { generateReport } = require("./report");
const { transcribeVoice } = require("./transcribe");
const { classifyIntent } = require("./intent");
const { identifyFromPhotos } = require("./listing/vision");
const { enrichWithWebSearch } = require("./listing/research");
const { buildDescription } = require("./listing/template");
const { postListing } = require("./listing/olx");

const bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN);

const CONFIDENCE_THRESHOLD = 70;

const ASSIGNEE_EMOJI = { worker: "👷", agent: "🤖" };
const STATUS_EMOJI = { pending: "📌", in_progress: "⏳", done: "✅" };
const PHOTOS_DIR = process.env.PHOTOS_DIR || path.join(__dirname, "..", "photos");
const WORKER_CHAT_ID = process.env.WORKER_CHAT_ID;

// Per-chat listing-creation session: { state, photos: [{base64, mediaType, filePath}], item, draft }
const listingSessions = new Map();

bot.start((ctx) =>
  ctx.reply(
    "Пиши, проговори или изпрати снимка с бележка (напр. \"маса миене\") и ще я превърна в задача.\n" +
      'Ако кажеш да пуснеш обява за продажба, ще премина в режим за създаване на обява.\n' +
      "/tasks — какво остава и какво е свършено\n" +
      "/done <id> — отбележи задача като свършена\n" +
      "/report — кратък отчет за статуса на задачите\n" +
      "/workers — списък с работници\n" +
      "/worker add <име> <chat id> [умения] — добави работник\n" +
      "/cancel — отказва текуща обява в процес на създаване"
  )
);

bot.command("cancel", (ctx) => {
  if (listingSessions.has(ctx.chat.id)) {
    cleanupListingSession(listingSessions.get(ctx.chat.id));
    listingSessions.delete(ctx.chat.id);
    return ctx.reply("Обявата е отказана.");
  }
  ctx.reply("Няма активна обява за отказване.");
});

bot.command("tasks", async (ctx) => {
  try {
    const tasks = await listTasks();
    if (tasks.length === 0) {
      await ctx.reply("Няма записани задачи.");
      return;
    }
    const pending = tasks.filter((t) => t.status !== "done");
    const done = tasks.filter((t) => t.status === "done");

    const lines = [];
    if (pending.length > 0) {
      lines.push("Остава:");
      for (const t of pending) {
        lines.push(
          `${STATUS_EMOJI[t.status] || "📌"} #${t.id} ${ASSIGNEE_EMOJI[t.assignee_type] || ""} ${t.title}`
        );
      }
    }
    if (done.length > 0) {
      lines.push("", "Свършено:");
      for (const t of done) {
        lines.push(`✅ #${t.id} ${t.title}`);
      }
    }
    await ctx.reply(lines.join("\n"));
  } catch (err) {
    await ctx.reply(`Грешка при четене на задачите: ${err.message}`);
  }
});

bot.command("report", async (ctx) => {
  try {
    const tasks = await listTasks();
    const report = await generateReport(tasks);
    await ctx.reply(report);
  } catch (err) {
    await ctx.reply(`Грешка при генериране на отчет: ${err.message}`);
  }
});

bot.command("workers", async (ctx) => {
  try {
    const workers = await listWorkers();
    if (workers.length === 0) {
      await ctx.reply('Няма добавени работници. Използвай "/worker add <име> <chat id> [умения]".');
      return;
    }
    const lines = workers.map(
      (w) => `#${w.id} ${w.name}${w.skills ? ` (${w.skills})` : ""}`
    );
    await ctx.reply(lines.join("\n"));
  } catch (err) {
    await ctx.reply(`Грешка: ${err.message}`);
  }
});

bot.command("worker", async (ctx) => {
  const parts = ctx.message.text.split(" ").slice(1);
  if (parts[0] !== "add") {
    await ctx.reply("Използване: /worker add <име> <chat id> [умения]");
    return;
  }
  const [name, telegramChatId, ...skillParts] = parts.slice(1);
  if (!name || !telegramChatId) {
    await ctx.reply("Използване: /worker add <име> <chat id> [умения]");
    return;
  }
  try {
    const worker = await createWorker({
      name,
      telegramChatId,
      skills: skillParts.length ? skillParts.join(" ") : null
    });
    await ctx.reply(`Добавен работник #${worker.id}: ${worker.name}`);
  } catch (err) {
    await ctx.reply(`Грешка: ${err.message}`);
  }
});

bot.command("done", async (ctx) => {
  const session = listingSessions.get(ctx.chat.id);
  if (session && session.state === "collecting_photos") {
    return finishPhotoCollection(ctx, session);
  }

  const id = ctx.message.text.split(" ")[1];
  if (!id) {
    await ctx.reply("Използване: /done <id>");
    return;
  }
  try {
    const task = await updateTaskStatus(id, "done");
    await ctx.reply(`✅ Задача #${task.id} (${task.title}) е отбелязана като свършена.`);
  } catch (err) {
    await ctx.reply(`Грешка: ${err.message}`);
  }
});

async function downloadFile(ctx, fileId) {
  const link = await ctx.telegram.getFileLink(fileId);
  const res = await fetch(link.href);
  return Buffer.from(await res.arrayBuffer());
}

async function downloadAndStorePhoto(ctx, fileId) {
  const buffer = await downloadFile(ctx, fileId);
  fs.mkdirSync(PHOTOS_DIR, { recursive: true });
  const filePath = path.join(PHOTOS_DIR, `${Date.now()}-${fileId}.jpg`);
  fs.writeFileSync(filePath, buffer);
  return { filePath, base64: buffer.toString("base64"), mediaType: "image/jpeg" };
}

function cleanupListingSession(session) {
  for (const p of session.photos) {
    fs.unlink(p.filePath, () => {});
  }
}

async function notifyWorker(ctx, task, photoPath) {
  if (!WORKER_CHAT_ID) return;
  const caption = `👷 Нова задача #${task.id}: ${task.title}${
    task.description ? "\n" + task.description : ""
  }`;
  try {
    if (photoPath) {
      await ctx.telegram.sendPhoto(WORKER_CHAT_ID, { source: photoPath }, { caption });
    } else {
      await ctx.telegram.sendMessage(WORKER_CHAT_ID, caption);
    }
  } catch (err) {
    await ctx.reply(`⚠️ Не успях да изпратя към работниците: ${err.message}`);
  }
}

async function promptAssignment(ctx, task) {
  const workers = await listWorkers();
  if (workers.length === 0) {
    await ctx.reply(
      `На кого да възложа задача #${task.id} (${task.title})? Все още няма добавени работници — ` +
        'използвай "/worker add <име> <chat id> [умения]", после опитай отново да я възложиш.'
    );
    if (task.assignee_type === "worker") {
      await notifyWorker(ctx, task, task.photo_path);
    }
    return;
  }
  const buttons = workers.map((w) =>
    Markup.button.callback(w.name, `assign:${task.id}:${w.id}`)
  );
  await ctx.reply(
    `На кого да възложа задача #${task.id}: ${task.title}?`,
    Markup.inlineKeyboard(buttons, { columns: 1 })
  );
}

async function processNote(ctx, text, { photoPath } = {}) {
  const structured = await analyzeNote(text);
  const task = await createTask({ ...structured, rawNote: text, photoPath: photoPath || null });
  await ctx.reply(`${ASSIGNEE_EMOJI[task.assignee_type] || ""} #${task.id} ${task.title}`);

  const needsAssignment =
    task.assignee_type === "worker" || (task.confidence != null && task.confidence < CONFIDENCE_THRESHOLD);

  if (needsAssignment) {
    await promptAssignment(ctx, task);
  }
}

async function finishPhotoCollection(ctx, session) {
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
    session.state = "collecting_photos";
    await ctx.reply("Грешка при анализа. Опитай отново или /cancel.");
  }
}

async function handleListingText(ctx, session, text) {
  if (session.state === "collecting_photos") {
    return ctx.reply("Изпрати снимки на машината, после напиши /done. /cancel за отказ.");
  }

  if (session.state === "awaiting_price") {
    const price = Number(text.replace(/[^\d.]/g, ""));
    if (!price) {
      return ctx.reply("Моля изпрати валидна цена (число).");
    }

    session.draft = buildDescription(session.item, price);
    session.state = "awaiting_confirm";

    return ctx.reply(
      `Чернова на обявата:\n\n` +
        `Заглавие: ${session.draft.title}\n\n${session.draft.description}\n\nЦена: ${price} лв\n\n` +
        `Изпрати "да" за публикуване в OLX или /cancel за отказ.`
    );
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
        photoPaths: session.photos.map((p) => p.filePath)
      });
      await ctx.reply(`Готово! ${result.url}`);
    } catch (err) {
      console.error(err);
      await ctx.reply(
        "Грешка при публикуването в OLX. Вероятно структурата на сайта изисква " +
          "обновяване на селекторите в src/listing/olx.js."
      );
    } finally {
      cleanupListingSession(session);
      listingSessions.delete(ctx.chat.id);
    }
  }
}

bot.on("text", async (ctx) => {
  const text = ctx.message.text;
  if (text.startsWith("/")) return;

  const session = listingSessions.get(ctx.chat.id);
  if (session) {
    return handleListingText(ctx, session, text.trim());
  }

  try {
    const intent = await classifyIntent(text);
    if (intent === "listing") {
      listingSessions.set(ctx.chat.id, { state: "collecting_photos", photos: [], item: null, draft: null });
      await ctx.reply("Добре, нова обява. Изпрати снимки на машината, после напиши /done.");
      return;
    }
    await processNote(ctx, text);
  } catch (err) {
    await ctx.reply(`Не успях да обработя бележката: ${err.message}`);
  }
});

bot.on("voice", async (ctx) => {
  try {
    const buffer = await downloadFile(ctx, ctx.message.voice.file_id);
    const transcript = await transcribeVoice(buffer);

    const session = listingSessions.get(ctx.chat.id);
    if (session) {
      return handleListingText(ctx, session, transcript.trim());
    }

    const intent = await classifyIntent(transcript);
    if (intent === "listing") {
      listingSessions.set(ctx.chat.id, { state: "collecting_photos", photos: [], item: null, draft: null });
      await ctx.reply("Добре, нова обява. Изпрати снимки на машината, после напиши /done.");
      return;
    }
    await processNote(ctx, transcript);
  } catch (err) {
    await ctx.reply(`Не успях да обработя гласовото съобщение: ${err.message}`);
  }
});

bot.on("photo", async (ctx) => {
  try {
    const photos = ctx.message.photo;
    const largest = photos[photos.length - 1];
    const caption = ctx.message.caption;

    const existingSession = listingSessions.get(ctx.chat.id);
    if (existingSession) {
      if (existingSession.state !== "collecting_photos") {
        return ctx.reply("Вече обработвам тази обява. Напиши /cancel за да започнеш отначало.");
      }
      const stored = await downloadAndStorePhoto(ctx, largest.file_id);
      existingSession.photos.push(stored);
      return ctx.reply(`Снимка получена (${existingSession.photos.length}). Изпрати още или напиши /done.`);
    }

    const intent = caption ? await classifyIntent(caption) : "task";
    if (intent === "listing") {
      const stored = await downloadAndStorePhoto(ctx, largest.file_id);
      listingSessions.set(ctx.chat.id, {
        state: "collecting_photos",
        photos: [stored],
        item: null,
        draft: null
      });
      await ctx.reply("Добре, нова обява. Изпрати още снимки или напиши /done.");
      return;
    }

    const stored = await downloadAndStorePhoto(ctx, largest.file_id);
    await processNote(ctx, caption || "Снимка без коментар", { photoPath: stored.filePath });
  } catch (err) {
    await ctx.reply(`Не успях да обработя снимката: ${err.message}`);
  }
});

bot.on("callback_query", async (ctx) => {
  const data = ctx.callbackQuery.data || "";
  const match = data.match(/^assign:(\d+):(\d+)$/);
  if (!match) return;
  const [, taskId, workerId] = match;

  try {
    const workers = await listWorkers();
    const worker = workers.find((w) => String(w.id) === workerId);
    if (!worker) {
      await ctx.answerCbQuery("Работникът не е намерен.");
      return;
    }

    const task = await updateTask(taskId, { assignedTo: worker.id, status: "in_progress" });
    await ctx.answerCbQuery("Възложено.");
    await ctx.editMessageText(`✅ Задача #${task.id} (${task.title}) е възложена на ${worker.name}.`);

    const message = `👷 Нова задача #${task.id}: ${task.title}${
      task.description ? "\n" + task.description : ""
    }`;
    if (task.photo_path) {
      await ctx.telegram.sendPhoto(worker.telegram_chat_id, { source: task.photo_path }, { caption: message });
    } else {
      await ctx.telegram.sendMessage(worker.telegram_chat_id, message);
    }
  } catch (err) {
    await ctx.answerCbQuery("Грешка при възлагане.");
    await ctx.reply(`Грешка при възлагане на задачата: ${err.message}`);
  }
});

bot.launch();
console.log("note-bot started");

process.once("SIGINT", () => bot.stop("SIGINT"));
process.once("SIGTERM", () => bot.stop("SIGTERM"));
