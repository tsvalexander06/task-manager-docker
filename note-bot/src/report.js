const Anthropic = require("@anthropic-ai/sdk");
const { STRONG } = require("./models");

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const SYSTEM_PROMPT = `Ти изготвяш кратък отчет на собственик на бизнес за статуса на задачите му.

Вход: списък със задачи (заглавие, статус, приоритет, на кого е възложена, кога е създадена).

Върни обикновен текст (не JSON), кратък и насочен към действие, със следната структура:

Свършено:
- ...

Чака изпълнение:
- ...

Предложения за по-бързо изпълнение:
- ...

Правила:
- Ако няма задачи в дадена секция, пропусни секцията изцяло.
- В "Предложения" посочвай конкретни наблюдения (напр. задачи, които стоят отдавна, задачи без назначен човек, задачи с висок приоритет, които не са започнати) — не давай общи съвети, които не следват от данните.
- Дръж го кратко — до колкото е необходимо, не повече.`;

async function generateReport(tasks) {
  const input = tasks
    .map(
      (t) =>
        `#${t.id} [${t.status}] (${t.priority}) ${t.title} — назначена на: ${
          t.assigned_to ?? "никой"
        }, създадена: ${t.created_at}`
    )
    .join("\n");

  const response = await anthropic.messages.create({
    model: STRONG,
    max_tokens: 800,
    system: SYSTEM_PROMPT,
    messages: [{ role: "user", content: input || "Няма задачи." }]
  });

  const block = response.content.find((b) => b.type === "text");
  return block?.text ?? "Не успях да генерирам отчет.";
}

module.exports = { generateReport };
