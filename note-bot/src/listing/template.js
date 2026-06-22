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

function buildTitle(item) {
  const parts = [item.brand, item.model, item.type].filter(Boolean);
  return parts.join(" ");
}

function buildDescription(item, price) {
  const lines = [];
  lines.push("Оборудването вече се дава и под наем!");
  lines.push("За повече информация пишете на лично");
  lines.push("");

  for (const [key, label] of FIELD_LABELS) {
    if (item[key]) {
      lines.push(`* ${label}: ${item[key]}`);
    }
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
