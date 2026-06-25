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
  createWorker,
  listEquipment,
  getEquipment,
  createEquipment,
  updateEquipment
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
// Bulgarian lev is currency-board pegged to the euro at this fixed rate.
const EUR_TO_BGN = 1.95583;

const ASSIGNEE_EMOJI = { worker: "👷", agent: "🤖" };
const STATUS_EMOJI = { pending: "📌", in_progress: "⏳", done: "✅" };
// Machine lifecycle: received -> servicing -> ready -> listed -> sold.
const EQUIPMENT_STATUS_LABEL = {
  received: "постъпила",
  servicing: "в сервиз",
  ready: "готова за продажба",
  listed: "обявена",
  sold: "продадена"
};
const EQUIPMENT_STATUS_EMOJI = {
  received: "📥",
  servicing: "🔧",
  ready: "✅",
  listed: "🏷️",
  sold: "💰"
};
const EQUIPMENT_STATUS_ORDER = ["received", "servicing", "ready", "listed", "sold"];
const PHOTOS_DIR = process.env.PHOTOS_DIR || path.join(__dirname, "..", "photos");
const WORKER_CHAT_ID = process.env.WORKER_CHAT_ID;
const OWNER_CHAT_ID = process.env.OWNER_CHAT_ID;
const REMINDER_HOUR = Number(process.env.REMINDER_HOUR || 9);
const COMPLETION_PATTERN = /готов|готово|свърш|приключ|done|finish/i;
const WASH_OR_REPAIR_PATTERN = /миене|почист|ремонт|поправ|фикс/i;

// Per-chat listing-creation session: { state, photos: [{base64, mediaType, filePath}], item, draft }
const listingSessions = new Map();
// Per-worker-chat session while the bot is asking "done with everything?": { state, pendingTaskIds }
const workerSessions = new Map();
let lastReminderDate = null;

// Chats that were just told (via nextStepReminder) to send photos for a new
// listing. A caption-less photo from one of these chats is treated as
// listing intent instead of defaulting to "task", since there's no caption
// text to classify. Expires on its own so it can't linger indefinitely.
const pendingListingPrompt = new Map();
function armListingPrompt(chatId) {
  if (!chatId) return;
  pendingListingPrompt.set(chatId, true);
  setTimeout(() => pendingListingPrompt.delete(chatId), 30 * 60 * 1000);
}

// After washing/fixing a machine, the next steps (photos -> listing -> hand off
// to the website engineer) are easy to forget — surface them as soon as that
// kind of task is marked done.
function nextStepReminder(task) {
  const haystack = `${task.title} ${task.category || ""}`;
  if (!WASH_OR_REPAIR_PATTERN.test(haystack)) return null;
  return (
    `🔁 Следваща стъпка за #${task.id} (${task.title}):\n` +
    `1) Направи снимки на машината\n` +
    `2) Създай обява (напиши бележка за обявата, ще влезеш в режим за обява)\n` +
    `3) Изпрати готовата обява на уеб инженера, за да я качи и на сайта`
  );
}

// Find-or-create an equipment record for each machine a note mentions, so the
// same physical machine isn't duplicated across its wash -> fix -> list notes.
// Matching is a fuzzy brand/model/name lookup that ignores already-sold units.
async function resolveEquipmentForNote(structured) {
  const machines = Array.isArray(structured.equipment) ? structured.equipment : [];
  if (machines.length === 0) return { records: [], primaryId: null, createdIds: [] };

  const isService = WASH_OR_REPAIR_PATTERN.test(`${structured.title} ${structured.category || ""}`);
  const records = [];
  const createdIds = [];

  for (const m of machines) {
    const query = m.model || m.brand || m.name;
    if (!query) continue;

    let existing = [];
    try {
      existing = await listEquipment({ match: query });
    } catch {
      existing = [];
    }

    let record = existing[0];
    if (!record) {
      record = await createEquipment({
        name: m.name || [m.brand, m.model].filter(Boolean).join(" ") || "Машина",
        brand: m.brand || null,
        model: m.model || null,
        category: m.category || null,
        status: isService ? "servicing" : "received"
      });
      createdIds.push(record.id);
    } else if (isService && record.status === "received") {
      record = await updateEquipment(record.id, { status: "servicing" });
    }
    records.push(record);
  }

  return { records, primaryId: records[0]?.id ?? null, createdIds };
}

// When a task tied to a machine is completed, the machine moves out of
// received/servicing and becomes ready to list. Returns a notice string or null.
async function advanceEquipmentOnTaskDone(task) {
  if (!task.equipment_id) return null;
  try {
    const eq = await getEquipment(task.equipment_id);
    if (eq && (eq.status === "received" || eq.status === "servicing")) {
      const updated = await updateEquipment(eq.id, { status: "ready" });
      return `🔧 Оборудване #${updated.id} ${updated.name} → готово за продажба.`;
    }
  } catch (err) {
    console.error("equipment advance failed:", err.message);
  }
  return null;
}

// When a listing publishes, persist the machine (or update the existing record
// that was washed/fixed earlier) as `listed` with its OLX link and specs.
async function captureListingEquipment(session, olxUrl) {
  const item = session.item || {};
  const name =
    [item.brand, item.model, item.type].filter(Boolean).join(" ") || session.draft.title;
  const query = item.model || item.brand || name;
  const specs = JSON.stringify(item);

  let existing = [];
  try {
    existing = await listEquipment({ match: query });
  } catch {
    existing = [];
  }

  if (existing[0]) {
    await updateEquipment(existing[0].id, {
      status: "listed",
      price: session.draft.price,
      olxUrl,
      specs,
      brand: item.brand || existing[0].brand,
      model: item.model || existing[0].model,
      category: item.type || existing[0].category,
      condition: item.condition || existing[0].condition
    });
  } else {
    await createEquipment({
      name,
      brand: item.brand || null,
      model: item.model || null,
      category: item.type || null,
      condition: item.condition || null,
      specs,
      status: "listed",
      price: session.draft.price,
      olxUrl
    });
  }
}

async function sendDailyReminderIfDue() {
  if (!OWNER_CHAT_ID) return;
  const now = new Date();
  const todayKey = now.toISOString().slice(0, 10);
  if (now.getHours() !== REMINDER_HOUR || lastReminderDate === todayKey) return;
  lastReminderDate = todayKey;

  try {
    const tasks = await listTasks();
    const pending = tasks.filter((t) => t.status !== "done");
    if (pending.length === 0) return;
    const lines = pending.map((t) => `${STATUS_EMOJI[t.status] || "📌"} #${t.id} ${t.title}`);
    await bot.telegram.sendMessage(OWNER_CHAT_ID, `⏰ Напомняне за днешните задачи:\n${lines.join("\n")}`);
  } catch (err) {
    console.error("Daily reminder failed:", err.message);
  }
}

bot.start((ctx) =>
  ctx.reply(
    "Пиши, проговори или изпрати снимка с бележка (напр. \"маса миене\") и ще я превърна в задача.\n" +
      'Ако кажеш да пуснеш обява за продажба, ще премина в режим за създаване на обява.\n' +
      "/tasks — какво остава и какво е свършено\n" +
      "/done <id> — отбележи задача като свършена\n" +
      "/report — кратък отчет за статуса на задачите\n" +
      "/equipment [статус] — оборудване по етап (received/servicing/ready/listed/sold)\n" +
      "/sold <id> — отбележи оборудване като продадено\n" +
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

  let id = ctx.message.text.split(" ")[1];
  if (!id && ctx.message.reply_to_message) {
    const replyText = ctx.message.reply_to_message.text || ctx.message.reply_to_message.caption || "";
    const match = replyText.match(/#(\d+)/);
    if (match) id = match[1];
  }
  if (!id) {
    await ctx.reply("Използване: /done <id> (или отговори с /done на съобщението със задачата)");
    return;
  }
  try {
    const task = await updateTaskStatus(id, "done");
    await ctx.reply(`✅ Задача #${task.id} (${task.title}) е отбелязана като свършена.`);
    const eqNotice = await advanceEquipmentOnTaskDone(task);
    if (eqNotice) await ctx.reply(eqNotice);
    const reminder = nextStepReminder(task);
    if (reminder) {
      await ctx.reply(reminder);
      armListingPrompt(ctx.chat.id);
    }
  } catch (err) {
    await ctx.reply(`Грешка: ${err.message}`);
  }
});

bot.command("equipment", async (ctx) => {
  const arg = ctx.message.text.split(" ")[1];
  try {
    const list = await listEquipment(arg ? { status: arg } : {});
    if (list.length === 0) {
      await ctx.reply(arg ? `Няма оборудване със статус "${arg}".` : "Няма записано оборудване.");
      return;
    }
    const byStatus = {};
    for (const e of list) {
      (byStatus[e.status] = byStatus[e.status] || []).push(e);
    }
    const lines = [];
    for (const s of EQUIPMENT_STATUS_ORDER) {
      if (!byStatus[s]) continue;
      lines.push(`${EQUIPMENT_STATUS_EMOJI[s] || ""} ${EQUIPMENT_STATUS_LABEL[s] || s}:`);
      for (const e of byStatus[s]) {
        lines.push(`  #${e.id} ${e.name}${e.olx_url ? ` — ${e.olx_url}` : ""}`);
      }
    }
    await ctx.reply(lines.join("\n"));
  } catch (err) {
    await ctx.reply(`Грешка: ${err.message}`);
  }
});

bot.command("sold", async (ctx) => {
  const id = ctx.message.text.split(" ")[1];
  if (!id) {
    await ctx.reply("Използване: /sold <id на оборудване>");
    return;
  }
  try {
    const eq = await updateEquipment(id, { status: "sold" });
    await ctx.reply(`💰 Оборудване #${eq.id} ${eq.name} → продадено.`);
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

async function findWorkerByChatId(chatId) {
  const workers = await listWorkers();
  return workers.find((w) => String(w.telegram_chat_id) === String(chatId));
}

// Detects a "#<id> <addition>" reference to an existing task and merges the
// addition into its description instead of creating a duplicate task. Only
// the addition (not the full combined description) is forwarded to whoever
// the task is already assigned to.
async function tryCombineWithExistingTask(ctx, text) {
  const match = text.match(/#(\d+)/);
  if (!match) return false;
  const addition = text.replace(match[0], "").trim();
  if (!addition) return false;

  const tasks = await listTasks();
  const task = tasks.find((t) => String(t.id) === match[1]);
  if (!task) return false;

  const combinedDescription = task.description ? `${task.description}\n${addition}` : addition;
  const updated = await updateTask(task.id, { description: combinedDescription });
  await ctx.reply(`➕ Добавено към задача #${updated.id} (${updated.title}).`);

  if (updated.assigned_to) {
    const workers = await listWorkers();
    const worker = workers.find((w) => w.id === updated.assigned_to);
    if (worker) {
      await ctx.telegram.sendMessage(
        worker.telegram_chat_id,
        `➕ Допълнение към задача #${updated.id} (${updated.title}):\n${addition}`
      );
    }
  }
  return true;
}

async function handleWorkerMessage(ctx, worker, text) {
  const session = workerSessions.get(ctx.chat.id);

  if (session && session.state === "awaiting_completion_scope") {
    const isAll = /всичк/i.test(text);
    const mentioned = [...text.matchAll(/#(\d+)/g)].map((m) => Number(m[1]));
    const idsToComplete = isAll
      ? session.pendingTaskIds
      : session.pendingTaskIds.filter((id) => mentioned.includes(id));

    if (idsToComplete.length === 0) {
      await ctx.reply('Не разбрах кои задачи. Напиши номерата (напр. "#6 #7") или "всички".');
      return;
    }

    const completed = [];
    for (const id of idsToComplete) {
      completed.push(await updateTaskStatus(id, "done"));
    }
    workerSessions.delete(ctx.chat.id);
    await ctx.reply(`✅ Отбелязах като свършени: ${completed.map((t) => `#${t.id}`).join(", ")}.`);

    const eqNotices = [];
    for (const task of completed) {
      const notice = await advanceEquipmentOnTaskDone(task);
      if (notice) eqNotices.push(notice);
    }
    if (OWNER_CHAT_ID) {
      const list = completed.map((t) => `#${t.id} ${t.title}`).join("\n");
      await ctx.telegram.sendMessage(OWNER_CHAT_ID, `✅ ${worker.name} приключи:\n${list}`);
      for (const notice of eqNotices) {
        await ctx.telegram.sendMessage(OWNER_CHAT_ID, notice);
      }
      for (const task of completed) {
        const reminder = nextStepReminder(task);
        if (reminder) {
          await ctx.telegram.sendMessage(OWNER_CHAT_ID, reminder);
          armListingPrompt(OWNER_CHAT_ID);
        }
      }
    }
    return;
  }

  if (!COMPLETION_PATTERN.test(text)) {
    await ctx.reply('Получено. Когато приключиш със задача, напиши "готово".');
    return;
  }

  const tasks = await listTasks();
  const open = tasks.filter((t) => t.assigned_to === worker.id && t.status !== "done");

  if (open.length === 0) {
    await ctx.reply("Нямаш активни задачи в момента.");
    return;
  }

  if (open.length === 1) {
    const task = await updateTaskStatus(open[0].id, "done");
    await ctx.reply(`✅ Отбелязах задача #${task.id} (${task.title}) като свършена.`);
    const eqNotice = await advanceEquipmentOnTaskDone(task);
    if (OWNER_CHAT_ID) {
      await ctx.telegram.sendMessage(OWNER_CHAT_ID, `✅ ${worker.name} приключи #${task.id}: ${task.title}`);
      if (eqNotice) await ctx.telegram.sendMessage(OWNER_CHAT_ID, eqNotice);
      const reminder = nextStepReminder(task);
      if (reminder) {
        await ctx.telegram.sendMessage(OWNER_CHAT_ID, reminder);
        armListingPrompt(OWNER_CHAT_ID);
      }
    }
    return;
  }

  workerSessions.set(ctx.chat.id, { state: "awaiting_completion_scope", pendingTaskIds: open.map((t) => t.id) });
  const list = open.map((t) => `#${t.id} ${t.title}`).join("\n");
  await ctx.reply(
    `Готов си с всичко възложено?\n${list}\n\nНапиши "всички" или номерата на готовите (напр. "#6 #7").`
  );
}

async function processNote(ctx, text, { photoPath, photoForVision } = {}) {
  const structured = await analyzeNote(text);

  // The note's text alone may not name the machine (e.g. "миене на" with a
  // nameplate photo attached) -- read the label off the photo to fill in
  // brand/model so resolveEquipmentForNote can still match/create the right
  // equipment record.
  if (photoForVision && (structured.equipment.length === 0 || structured.equipment.some((e) => !e.brand && !e.model))) {
    try {
      const identified = await identifyFromPhotos([photoForVision]);
      if (identified && (identified.brand || identified.model || identified.type)) {
        if (structured.equipment.length === 0) {
          structured.equipment = [
            {
              name: [identified.brand, identified.model, identified.type].filter(Boolean).join(" ") || "Машина",
              brand: identified.brand || null,
              model: identified.model || null,
              category: identified.type || null
            }
          ];
        } else {
          structured.equipment = structured.equipment.map((e) =>
            !e.brand && !e.model
              ? {
                  ...e,
                  brand: identified.brand || e.brand,
                  model: identified.model || e.model,
                  category: e.category || identified.type
                }
              : e
          );
        }
      }
    } catch (err) {
      console.error("photo equipment identification failed:", err.message);
    }
  }

  const { records, primaryId, createdIds } = await resolveEquipmentForNote(structured);
  const task = await createTask({
    ...structured,
    rawNote: text,
    photoPath: photoPath || null,
    equipmentId: primaryId
  });
  await ctx.reply(`${ASSIGNEE_EMOJI[task.assignee_type] || ""} #${task.id} ${task.title}`);

  if (records.length > 0) {
    const lines = records.map((r) => {
      const tag = createdIds.includes(r.id) ? "нова" : "съществуваща";
      return `🔧 Оборудване #${r.id} ${r.name} (${EQUIPMENT_STATUS_LABEL[r.status] || r.status}, ${tag})`;
    });
    await ctx.reply(lines.join("\n"));
  }

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
    const amount = Number(text.replace(/[^\d.]/g, ""));
    if (!amount) {
      return ctx.reply("Моля изпрати валидна цена (число).");
    }
    const isEuro = /€|евро|eur\b/i.test(text);
    const price = isEuro ? Math.round(amount * EUR_TO_BGN * 100) / 100 : amount;

    session.draft = buildDescription(session.item, price);
    session.state = "awaiting_confirm";

    const conversionNote = isEuro ? ` (конвертирано от ${amount} €)` : "";
    return ctx.reply(
      `Чернова на обявата:\n\n` +
        `Заглавие: ${session.draft.title}\n\n${session.draft.description}\n\nЦена: ${price} лв${conversionNote}\n\n` +
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
      try {
        await captureListingEquipment(session, result.url);
      } catch (eqErr) {
        console.error("equipment capture failed:", eqErr.message);
      }
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

  try {
    const worker = await findWorkerByChatId(ctx.chat.id);
    if (worker) {
      return handleWorkerMessage(ctx, worker, text.trim());
    }

    const session = listingSessions.get(ctx.chat.id);
    if (session) {
      return handleListingText(ctx, session, text.trim());
    }

    if (await tryCombineWithExistingTask(ctx, text)) return;

    const intent = await classifyIntent(text);
    if (intent === "listing") {
      listingSessions.set(ctx.chat.id, { state: "collecting_photos", photos: [], item: null, draft: null });
      await ctx.reply("Добре, нова обява. Изпрати снимки на машината, после напиши /done.");
      return;
    }
    await processNote(ctx, text);
  } catch (err) {
    console.error("text handler failed:", err);
    await ctx.reply(`Не успях да обработя бележката: ${err.message}`);
  }
});

bot.on("voice", async (ctx) => {
  try {
    const buffer = await downloadFile(ctx, ctx.message.voice.file_id);
    const transcript = await transcribeVoice(buffer);

    const worker = await findWorkerByChatId(ctx.chat.id);
    if (worker) {
      return handleWorkerMessage(ctx, worker, transcript.trim());
    }

    const session = listingSessions.get(ctx.chat.id);
    if (session) {
      return handleListingText(ctx, session, transcript.trim());
    }

    if (await tryCombineWithExistingTask(ctx, transcript)) return;

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

    const hadListingPrompt = pendingListingPrompt.get(ctx.chat.id);
    pendingListingPrompt.delete(ctx.chat.id);

    const intent = caption ? await classifyIntent(caption) : hadListingPrompt ? "listing" : "task";
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
    await processNote(ctx, caption || "Снимка без коментар", {
      photoPath: stored.filePath,
      photoForVision: { base64: stored.base64, mediaType: stored.mediaType }
    });
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

function launchWithRetry(delayMs = 5000) {
  bot
    .launch()
    .then(() => console.log("note-bot started"))
    .catch((err) => {
      console.error("bot.launch() failed, retrying in", delayMs, "ms:", err.message);
      setTimeout(() => launchWithRetry(Math.min(delayMs * 2, 60000)), delayMs);
    });
}

launchWithRetry();

setInterval(sendDailyReminderIfDue, 60 * 1000);

process.once("SIGINT", () => bot.stop("SIGINT"));
process.once("SIGTERM", () => bot.stop("SIGTERM"));
