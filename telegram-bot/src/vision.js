const Anthropic = require("@anthropic-ai/sdk");

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const IDENTIFY_PROMPT = `You are looking at photos of a piece of professional kitchen equipment.
Read any nameplate/label visible in the photos (brand, model, voltage, power, capacity, IP rating, dimensions).
Respond with ONLY a JSON object, no other text, with these keys (use null for anything you cannot determine):
{
  "brand": string|null,
  "model": string|null,
  "type": string|null,        // Bulgarian description of what the machine is, e.g. "професионална белачка за картофи"
  "capacity": string|null,     // include unit, e.g. "7 кг"
  "voltage": string|null,      // e.g. "230 V"
  "power": string|null,        // e.g. "0.18 kW"
  "ipRating": string|null,     // e.g. "IP55"
  "dimensions": string|null,   // "Ш x Д x В" in cm, e.g. "41 x 53 x 80 см"
  "condition": string|null     // default to "употребявана" (used) unless it looks new
}`;

async function identifyFromPhotos(images) {
  const content = images.map((img) => ({
    type: "image",
    source: { type: "base64", media_type: img.mediaType, data: img.base64 },
  }));
  content.push({ type: "text", text: IDENTIFY_PROMPT });

  const response = await client.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 1024,
    messages: [{ role: "user", content }],
  });

  const text = response.content.find((b) => b.type === "text")?.text ?? "{}";
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  return JSON.parse(jsonMatch ? jsonMatch[0] : text);
}

module.exports = { identifyFromPhotos };
