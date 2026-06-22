const Anthropic = require("@anthropic-ai/sdk");

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const SYSTEM_PROMPT = `Ти класифицираш съобщение от собственик на konvektomat.store (бизнес за продажба/наем на професионално кухненско оборудване).

Отговори СТРОГО само с една дума, без друг текст:
- "listing" — ако собственикът иска да създаде/публикува обява за продажба на конкретна машина (напр. "пусни тази витрина за продажба", "качи обява за конвектомата", изпраща снимки на машина с намерение да я обяви).
- "task" — за всичко друго: обикновени бележки, поддръжка, напомняния, въпроси и т.н.

Ако не е напълно ясно, отговори "task" — по-безопасно е да отиде като обикновена задача, отколкото да стартира грешно процеса по публикуване на обява.`;

async function classifyIntent(text) {
  const response = await anthropic.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 10,
    system: SYSTEM_PROMPT,
    messages: [{ role: "user", content: text }]
  });

  const block = response.content.find((b) => b.type === "text");
  return block?.text.trim().toLowerCase().includes("listing") ? "listing" : "task";
}

module.exports = { classifyIntent };
