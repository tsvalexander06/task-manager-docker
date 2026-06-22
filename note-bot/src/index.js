require("dotenv").config();
const fs = require("fs");
const path = require("path");
const { Telegraf } = require("telegraf");
const { analyzeNote } = require("./analyze");
const { createTask, listTasks, updateTaskStatus } = require("./backend");
const { transcribeVoice } = require("./transcribe");

const bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN);

const ASSIGNEE_EMOJI = { worker: "👷", agent: "🤖" };
const STATUS_EMOJI = { pending: "📌", in_progress: "⏳", done: "✅" };
const PHOTOS_DIR = process.env.PHOTOS_DIR || path.join(__dirname, "..", "photos");
const WORKER_CHAT_ID = process.env.WORKER_CHAT_ID;

bot.start((ctx) =>
  ctx.reply(
    "Пиши, проговори или изпрати снимка с бележка (напр. \"маса миене\") и ще я превърна в задача.\n" +
      "/tasks — какво остава и какво е свършено\n" +
      "/done <id> — отбележи задача като свършена"
  )
);

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

bot.command("done", async (ctx) => {
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

async function processNote(ctx, text, { photoPath } = {}) {
  const structured = await analyzeNote(text);
  const task = await createTask({ ...structured, rawNote: text, photoPath: photoPath || null });
  await ctx.reply(`${ASSIGNEE_EMOJI[task.assignee_type] || ""} #${task.id} ${task.title}`);
  if (task.assignee_type === "worker") {
    await notifyWorker(ctx, task, photoPath);
  }
}

bot.on("text", async (ctx) => {
  const text = ctx.message.text;
  if (text.startsWith("/")) return;

  try {
    await processNote(ctx, text);
  } catch (err) {
    await ctx.reply(`Не успях да обработя бележката: ${err.message}`);
  }
});

bot.on("voice", async (ctx) => {
  try {
    const buffer = await downloadFile(ctx, ctx.message.voice.file_id);
    const transcript = await transcribeVoice(buffer);
    await processNote(ctx, transcript);
  } catch (err) {
    await ctx.reply(`Не успях да обработя гласовото съобщение: ${err.message}`);
  }
});

bot.on("photo", async (ctx) => {
  try {
    const photos = ctx.message.photo;
    const largest = photos[photos.length - 1];
    const buffer = await downloadFile(ctx, largest.file_id);

    fs.mkdirSync(PHOTOS_DIR, { recursive: true });
    const filePath = path.join(PHOTOS_DIR, `${Date.now()}-${largest.file_id}.jpg`);
    fs.writeFileSync(filePath, buffer);

    const caption = ctx.message.caption || "Снимка без коментар";
    await processNote(ctx, caption, { photoPath: filePath });
  } catch (err) {
    await ctx.reply(`Не успях да обработя снимката: ${err.message}`);
  }
});

bot.launch();
console.log("note-bot started");

process.once("SIGINT", () => bot.stop("SIGINT"));
process.once("SIGTERM", () => bot.stop("SIGTERM"));
