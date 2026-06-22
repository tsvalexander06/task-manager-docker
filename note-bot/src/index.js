require("dotenv").config();
const { Telegraf } = require("telegraf");
const { analyzeNote } = require("./analyze");
const { createTask, listTasks, updateTaskStatus } = require("./backend");

const bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN);

const ASSIGNEE_EMOJI = { worker: "👷", agent: "🤖" };
const STATUS_EMOJI = { pending: "📌", in_progress: "⏳", done: "✅" };

bot.start((ctx) =>
  ctx.reply(
    "Пиши ми бележка (напр. \"маса миене\") и ще я превърна в задача.\n" +
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

bot.on("text", async (ctx) => {
  const text = ctx.message.text;
  if (text.startsWith("/")) return;

  try {
    const structured = await analyzeNote(text);
    const task = await createTask({ ...structured, rawNote: text });
    await ctx.reply(
      `${ASSIGNEE_EMOJI[task.assignee_type] || ""} #${task.id} ${task.title}`
    );
  } catch (err) {
    await ctx.reply(`Не успях да обработя бележката: ${err.message}`);
  }
});

bot.launch();
console.log("note-bot started");

process.once("SIGINT", () => bot.stop("SIGINT"));
process.once("SIGTERM", () => bot.stop("SIGTERM"));
