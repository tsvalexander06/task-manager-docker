const Anthropic = require("@anthropic-ai/sdk");

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

function missingFields(item) {
  return ["capacity", "voltage", "power", "ipRating", "dimensions"].filter(
    (key) => !item[key]
  );
}

async function enrichWithWebSearch(item) {
  const missing = missingFields(item);
  if (missing.length === 0 || !item.brand) return item;

  const prompt = `Search the web for the technical specifications of this professional kitchen equipment: brand "${item.brand}", model "${item.model || ""}".
I'm missing these fields: ${missing.join(", ")}.
Respond with ONLY a JSON object containing the fields you found (use null if you genuinely cannot find a value): ${JSON.stringify(
    missing
  )}
Use the same units/format as a spec sheet, e.g. "230 V", "0.18 kW", "IP55", "41 x 53 x 80 см".`;

  const response = await client.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 1024,
    tools: [{ type: "web_search_20250305", name: "web_search", max_uses: 5 }],
    messages: [{ role: "user", content: prompt }],
  });

  const textBlocks = response.content.filter((b) => b.type === "text");
  const text = textBlocks.map((b) => b.text).join("\n");
  const jsonMatch = text.match(/\{[\s\S]*\}/);

  let found = {};
  try {
    found = jsonMatch ? JSON.parse(jsonMatch[0]) : {};
  } catch {
    found = {};
  }

  const merged = { ...item };
  for (const key of missing) {
    if (found[key]) merged[key] = found[key];
  }
  return merged;
}

module.exports = { enrichWithWebSearch };
