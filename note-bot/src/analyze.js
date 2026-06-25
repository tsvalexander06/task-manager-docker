const Anthropic = require("@anthropic-ai/sdk");
const { FAST } = require("./models");

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const SYSTEM_PROMPT = `Ти превръщаш кратки гласови/писмени бележки от собственик на бизнес ("хвърчащи бележки", напр. "маса миене") в структурирана задача.

Върни СТРОГО само следния JSON, без markdown форматиране и без коментари:

{
  "title": string,
  "description": string|null,
  "category": string|null,
  "assigneeType": "worker"|"agent",
  "agentType": string|null,
  "confidence": number (0-100),
  "priority": "low"|"normal"|"high",
  "equipment": [ { "name": string, "brand": string|null, "model": string|null, "category": string|null } ]
}

Правила за "equipment":
- Попълвай ТОЛКОВА за конкретни професионални кухненски машини/уреди, които задачата засяга (напр. хладилник, конвектомат, фурна, миялна, омекотител, белачка). Една бележка може да споменава повече от една машина (напр. "Foster и Electrolux миене" = два записа).
- "name" е кратко човешко име на машината (напр. "Foster хладилник"). "brand"/"model" попълвай само ако са ясни от текста, иначе null. "category" е типът (напр. "хладилно", "термично", "неутрално") или null.
- Ако задачата НЕ е за конкретна машина (напр. "маса миене", "почисти пода"), върни "equipment": [].

Правила за assigneeType:
- "worker" — задачата изисква физическо присъствие/действие на място (почистване, ремонт, преместване на оборудване, среща на клиент и т.н.) или човешка преценка/одобрение.
- "agent" — задачата е чисто информационна/дигитална и AI агент може да я свърши сам (намиране на информация, изготвяне на чернова на текст, изпращане на съобщение по шаблон, проверка на наличност в записите).
- Ако не си сигурен, избирай "worker" — по-безопасно е да отиде при човек, отколкото агент да предприеме грешно действие.

Ако assigneeType е "agent", попълни "agentType" със свободен етикет какъв вид агент е нужен (напр. "research", "communication", "scheduling", "general"). Ако е "worker", остави "agentType": null.

"confidence" (0-100) показва колко сигурен си, че избраното assigneeType/agentType е правилно И че агент действително може напълно да свърши задачата сам. Ниска увереност (под 70) означава "по-добре да попитам собственика кой да поеме това", дори ако формално си избрал "agent".

"title" трябва да е кратко и ясно (до ~6 думи). "category" е свободен етикет (напр. "поддръжка", "продажби", "логистика") или null ако не е ясно.`;

async function analyzeNote(text) {
  const response = await anthropic.messages.create({
    model: FAST,
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
