const FIELD_LABELS = [
  ["brand", "Марка"],
  ["model", "Модел"],
  ["type", "Тип"],
  ["capacity", "Капацитет"],
  ["voltage", "Захранване"],
  ["power", "Мощност"],
  ["ipRating", "Степен на защита"],
  ["dimensions", "Размери"],
  ["condition", "Състояние"],
];

function capitalize(s) {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}

// "267.8 L" -> "268L"
function formatCapacityShort(capacity) {
  const match = String(capacity || "").match(/([\d.]+)/);
  if (!match) return null;
  return `${Math.round(parseFloat(match[1]))}L`;
}

// "600 x 705 x 1900 mm" -> "60 × 70.5 × 190 см (Ш × Д × В)"
function formatDimensions(raw) {
  if (!raw) return null;
  const nums = raw.match(/[\d.]+/g);
  if (!nums || nums.length < 2) return raw;
  const isMm = /mm|мм/i.test(raw);
  const values = nums.map((n) => {
    const v = isMm ? parseFloat(n) / 10 : parseFloat(n);
    return Number(v.toFixed(1)).toString();
  });
  return `${values.join(" × ")} см (Ш × Д × В)`;
}

function buildTitle(item) {
  const parts = [item.type, item.brand].filter(Boolean);
  let title = capitalize(parts.join(" "));
  const capacity = formatCapacityShort(item.capacity);
  if (capacity) title += ` - ${capacity}`;
  return title;
}

function buildDescription(item, price) {
  const lines = [];
  lines.push("Оборудването вече се дава и под наем!");
  lines.push("За повече информация пишете на лично");
  lines.push("");

  for (const [key, label] of FIELD_LABELS) {
    if (!item[key]) continue;
    const value = key === "dimensions" ? formatDimensions(item[key]) : item[key];
    lines.push(`* ${label}: ${value}`);
  }
  lines.push("* 3 месеца гаранционен сервиз");
  lines.push("* Извънгаранционен сервиз");
  lines.push("");
  lines.push("За повече информация и промоции разгледайте нашия сайт");
  lines.push("www.konvektomat.store");
  lines.push("");
  lines.push(
    "Разполагаме с голям брой професионални уреди на склад, както и сервиз и резервни части за тях."
  );

  return {
    title: buildTitle(item),
    description: lines.join("\n"),
    price,
  };
}

module.exports = { buildDescription, buildTitle, FIELD_LABELS };
