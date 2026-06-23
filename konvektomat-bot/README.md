# konvektomat-bot

Telegram + WhatsApp клиентски бот за **konvektomat.store** (наем на професионално
кухненско оборудване, България) с **human-in-the-loop** одобрение чрез Claude.

## Как работи (поток)

1. Клиент пише по **Telegram** или **WhatsApp**.
2. Ботът праща съобщението + историята на разговора към **Claude**, заедно с твоя
   системен промпт.
3. Claude връща **черновa** отговор на български.
4. Черновата отива в **твоя личен Telegram чат** (оператор `OPERATOR_CHAT_ID`) с
   inline бутони:
   - **✅ Send** — праща черновата на клиента непроменена.
   - **✏️ Rewrite** — ботът те моли да напишеш нов текст; ти отговаряш (**reply**)
     на неговото съобщение; твоят текст се праща на клиента.
5. Отговорът се доставя на клиента по **оригиналния му канал** (TG клиент → Telegram,
   WA клиент → WhatsApp).

---

## Структура на проекта

```
konvektomat-bot/
├── package.json
├── .env.example          # всички нужни променливи
├── .gitignore
├── README.md
└── src/
    ├── index.js          # entry point: Express сървър + старт на Telegram бота
    ├── config.js         # зареждане и валидация на .env
    ├── logger.js         # минимален логер
    ├── state.js          # памет: история по клиент, чакащи драфтове, rewrite контекст
    ├── claude.js         # генериране на драфт чрез @anthropic-ai/sdk
    ├── system-prompt.md  # системен промпт (редактирай го; или ползвай SYSTEM_PROMPT)
    ├── review.js         # оркестрация на human-in-the-loop логиката
    └── channels/
        ├── telegram.js   # клиентски Telegram + операторски преглед (telegraf)
        └── whatsapp.js   # WhatsApp Cloud API (HTTP към graph.facebook.com) + webhook
```

---

## 1. Инсталиране

Нужен е **Node.js ≥ 20**.

```bash
cd konvektomat-bot
npm install
```

## 2. Конфигуриране

```bash
cp .env.example .env
```

Попълни в `.env`:

| Променлива | Какво е |
|---|---|
| `TELEGRAM_BOT_TOKEN` | Токен от [@BotFather](https://t.me/BotFather) |
| `OPERATOR_CHAT_ID` | Твоят личен Telegram chat ID (вече е `8785668541`) |
| `ANTHROPIC_API_KEY` | API ключ от [console.anthropic.com](https://console.anthropic.com) |
| `CLAUDE_MODEL` | Модел (по подразбиране `claude-sonnet-4-6`) |
| `WHATSAPP_TOKEN` | Access token от Meta App |
| `WHATSAPP_PHONE_NUMBER_ID` | Phone Number ID от WhatsApp API Setup |
| `WHATSAPP_VERIFY_TOKEN` | Произволен низ, който измисляш ти (ползва се при webhook setup) |

> **Системен промпт:** редактирай `src/system-prompt.md`, **или** постави целия
> текст в `SYSTEM_PROMPT` в `.env` (env-ът има приоритет).

> **Как да намеря моя Telegram chat ID?** Напиши на бота [@userinfobot](https://t.me/userinfobot)
> или стартирай този бот и виж лога — при всяко съобщение се логва `chatId`.

## 3. Локално стартиране

```bash
npm start
# или с авто-рестарт при промени:
npm run dev
```

Telegram работи **веднага** (polling). За WhatsApp трябва публичен URL към
webhook-а — виж по-долу.

---

## Редактиране на системния промпт (3 начина)

Промптът определя как Claude пише отговорите. Имаш три начина да го менажираш:

| Начин | Кога | Остава ли след рестарт? |
|---|---|---|
| **Команди в Telegram** (`/prompt`, `/setprompt`, `/resetprompt`) | Бърз експеримент — пробваш и тунваш на живо | ❌ Не (до рестарт/redeploy) |
| **Railway → Variables → `SYSTEM_PROMPT`** | Финалната версия, която искаш постоянно | ✅ Да |
| **Файл `src/system-prompt.md`** (commit в Git) | Версия под контрол на Git | ✅ Да |

### Команди в Telegram (само за оператора)

Пишеш ги в твоя личен чат с бота:

- **`/prompt`** — показва текущия промпт и откъде идва.
- **`/setprompt`** — ботът праща съобщение; ти му отговаряш (**reply**) с новия текст.
  Влиза в сила **веднага** за следващите отговори.
- **`/resetprompt`** — връща оригиналния промпт (от `SYSTEM_PROMPT` или файла).

> 💡 **Работен поток за тунване:** пускаш `/setprompt`, пробваш с тестов клиент,
> не ти харесва → пак `/setprompt` с поправка, и така докато си доволен. Когато
> финалният текст ти хареса, пусни `/prompt`, копирай го и го залепи в
> **Railway → Variables → `SYSTEM_PROMPT`**, за да остане завинаги.

> ⚠️ Живата промяна през Telegram се пази в паметта и **се губи при рестарт/redeploy**.
> Това е нарочно — командите са за експеримент; постоянството идва от `SYSTEM_PROMPT`.

---

## Telegram: polling vs webhook — кое да избера?

- **Polling (по подразбиране в този проект)** — ботът сам пита Telegram за нови
  съобщения. **Препоръчвам за старт**: нищо за настройка, работи и зад NAT/локално.
- **Webhook** — Telegram праща съобщенията към публичен URL. По-ефективно при
  голям трафик, но изисква публичен HTTPS адрес и допълнителна настройка.

👉 **Започни с polling.** Този код вече е на polling. Webhook за Telegram си струва
едва при сериозен трафик.

> ⚠️ Не пускай два инстанса с polling за същия бот едновременно — Telegram дава
> грешка `409 Conflict`.

---

## WhatsApp Cloud API: задължителен webhook

WhatsApp **изисква** публичен HTTPS endpoint. Ендпойнтите в този проект:

- `GET  /webhook/whatsapp` — верификация (Meta проверява `WHATSAPP_VERIFY_TOKEN`)
- `POST /webhook/whatsapp` — входящи съобщения (status callback-ите се игнорират)

### Настройка в Meta

1. [developers.facebook.com](https://developers.facebook.com) → твоето App → **WhatsApp**.
2. От **API Setup** вземи `WHATSAPP_PHONE_NUMBER_ID` и временния `WHATSAPP_TOKEN`
   (за продукция: генерирай **permanent token** през System User).
3. **Configuration → Webhook → Edit**:
   - **Callback URL:** `https://ТВОЯТ-ПУБЛИЧЕН-URL/webhook/whatsapp`
   - **Verify token:** същата стойност като `WHATSAPP_VERIFY_TOKEN`
   - Натисни **Verify and save** (приложението трябва да върви, за да мине проверката).
4. **Subscribe** за полето **messages**.

### ⚠️ 24-часов прозорец

WhatsApp позволява **свободни (free-form)** отговори само в рамките на **24 часа**
след последното съобщение на клиента. След това можеш да пращаш само **одобрени
template** съобщения. За клиентски support това обикновено е ОК (отговаряш веднага),
но ако одобряваш драфт след 24ч, доставката ще се провали — тогава ползвай template.

---

## Хостинг (препоръка: Railway или Render — лесно и евтино/безплатно)

Нямаш нужда от Docker. И двете платформи разпознават Node.js проект автоматично.

### Вариант A: Railway (най-лесен)

1. Качи кода в GitHub repo.
2. [railway.app](https://railway.app) → **New Project → Deploy from GitHub repo**.
3. Ако repo-то има няколко папки, задай **Root Directory** = `konvektomat-bot`.
4. **Variables:** добави всички променливи от `.env` (без `PORT` — Railway го подава сам).
5. Deploy. Railway дава публичен домейн (Settings → **Generate Domain**).
6. Публичният URL за WhatsApp е: `https://<твоят-домейн>/webhook/whatsapp`.

### Вариант B: Render

1. Качи кода в GitHub.
2. [render.com](https://render.com) → **New → Web Service** → избери repo-то.
3. **Root Directory:** `konvektomat-bot`
   **Build Command:** `npm install`
   **Start Command:** `npm start`
4. Добави **Environment Variables** (всички от `.env`).
5. Deploy. Render дава публичен URL → WhatsApp webhook = `<URL>/webhook/whatsapp`.

> На безплатния план на Render услугата „заспива" при липса на трафик и се събужда
> бавно при следваща заявка — за продукция ползвай платен план или Railway.

След deploy: върни се в Meta и въведи публичния `/webhook/whatsapp` URL + verify token.

---

## Какво ще иска тестване / итерация

Тези части почти сигурно ще трябва да се донастроят на живо:

1. **WhatsApp webhook** — верификацията и структурата на входящия payload.
   Тествай с реален номер; провери лога `WhatsApp ← ...`. Status callback-ите
   (delivered/read) се игнорират — увери се, че не предизвикват шум.
2. **Хващане на Rewrite reply** — разчита на това операторът да направи **reply**
   точно на съобщението „напиши новия отговор". Тествай: натисни ✏️ Rewrite,
   отговори с reply, провери че текстът стига до клиента.
3. **24-часов прозорец на WhatsApp** — ако одобряваш стар драфт, провери поведението
   при изтекъл прозорец (ще трябва template).
4. **Системен промпт** — итерирай по тона/качеството на драфтовете в `system-prompt.md`.
5. **CLAUDE_MODEL** — пробвай `claude-sonnet-4-6` срещу `claude-opus-4-8` за баланс
   качество/цена.

---

## Робастност (вече вградено)

- Ако **Claude гръмне** или върне празно → ботът не пада; вместо това уведомява
  оператора, че трябва ръчен отговор.
- **Празни съобщения** се игнорират.
- WhatsApp webhook винаги връща `200` бързо (без retry storm) и грешките се
  логват, без да събарят процеса.
- Грешки при изпращане към клиент се логват и операторът се уведомява.

---

## Разширяване към истинска база (вместо in-memory)

Сега историята и чакащите драфтове живеят в паметта (`src/state.js`) — при рестарт
се губят. За продукция замени Map-овете със **SQLite** (напр. `better-sqlite3`)
или Postgres. Целият достъп минава през функциите в `state.js`, така че се пипа
**само този файл**:

- `getHistory / appendUserMessage / appendAssistantMessage`
- `createPendingDraft / getPendingDraft / setDraftOperatorMessage / deletePendingDraft`
- `setRewriteContext / getRewriteContext / deleteRewriteContext`

---

## Сигурност

- Нищо чувствително не е хардкоднато — всичко минава през `.env`.
- `.env` е в `.gitignore` — не го качвай в Git.
- За WhatsApp в продукция ползвай **permanent token** (System User), не временния.
