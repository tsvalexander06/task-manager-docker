const Anthropic = require("@anthropic-ai/sdk");
const { FAST } = require("./models");

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const SYSTEM_PROMPT = `На собственик на konvektomat.store даваш списък от отворени задачи (id и заглавие/описание) и свободен текст, с който той описва коя задача е свършил.

Върни СТРОГО само следния JSON, без markdown и без коментари:
{ "id": number|null }

Правила:
- Избери "id" на задачата, за която текстът най-вероятно се отнася (по смисъл, не само по точни думи).
- Ако текстът ясно съвпада с повече от една задача, или с нито една, върни "id": null — по-безопасно е да попиташ собственика, отколкото да затвориш грешна задача.`;

async function matchTaskByText(text, tasks) {
  if (tasks.length === 0) return null;

  const list = tasks
    .map((t) => `#${t.id}: ${t.title}${t.description ? ` — ${t.description}` : ""}`)
    .join("\n");
  const userMessage = `Отворени задачи:\n${list}\n\nСобственикът написа: "${text}"`;

  const response = await anthropic.messages.create({
    model: FAST,
    max_tokens: 50,
    system: SYSTEM_PROMPT,
    messages: [{ role: "user", content: userMessage }]
  });

  const textBlock = response.content.find((block) => block.type === "text");
  const match = textBlock?.text.match(/\{[\s\S]*\}/);
  if (!match) return null;
  const parsed = JSON.parse(match[0]);
  if (parsed.id == null) return null;
  return tasks.some((t) => t.id === parsed.id) ? parsed.id : null;
}

module.exports = { matchTaskByText };
