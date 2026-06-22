const Anthropic = require("@anthropic-ai/sdk");

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const SYSTEM_PROMPT = `Ти превръщаш кратки гласови/писмени бележки от собственик на бизнес ("хвърчащи бележки", напр. "маса миене") в структурирана задача.

Върни СТРОГО само следния JSON, без markdown форматиране и без коментари:

{
  "title": string,
  "description": string|null,
  "category": string|null,
  "assigneeType": "worker"|"agent",
  "priority": "low"|"normal"|"high"
}

Правила за assigneeType:
- "worker" — задачата изисква физическо присъствие/действие на място (почистване, ремонт, преместване на оборудване, среща на клиент и т.н.) или човешка преценка/одобрение.
- "agent" — задачата е чисто информационна/дигитална и AI агент може да я свърши сам (намиране на информация, изготвяне на чернова на текст, изпращане на съобщение по шаблон, проверка на наличност в записите).
- Ако не си сигурен, избирай "worker" — по-безопасно е да отиде при човек, отколкото агент да предприеме грешно действие.

"title" трябва да е кратко и ясно (до ~6 думи). "category" е свободен етикет (напр. "поддръжка", "продажби", "логистика") или null ако не е ясно.`;

async function analyzeNote(text) {
  const response = await anthropic.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 500,
    system: SYSTEM_PROMPT,
    messages: [{ role: "user", content: text }]
  });

  const textBlock = response.content.find((block) => block.type === "text");
  const match = textBlock?.text.match(/\{[\s\S]*\}/);
  if (!match) {
    throw new Error("Could not parse structured note from model response");
  }
  return JSON.parse(match[0]);
}

module.exports = { analyzeNote };
