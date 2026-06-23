# Качване в Railway — стъпка по стъпка (за начинаещи)

Това ръководство те води от нулата до работещ бот в облака. Не е нужно да
разбираш от хостинг — само следвай стъпките една по една.

> **Какво е Railway?** Услуга, която взима кода ти от GitHub, пуска го на постоянно
> включен сървър в облака и му дава публичен интернет адрес. Точно това ни трябва,
> за да работи WhatsApp и ботът да е винаги онлайн.

---

## Преди да започнеш — събери тези неща

Отвори си текстов файл и сложи следните стойности на едно място (ще ги копираш в Railway):

| Стойност | Откъде |
|---|---|
| `TELEGRAM_BOT_TOKEN` | от [@BotFather](https://t.me/BotFather) в Telegram |
| `OPERATOR_CHAT_ID` | `8785668541` (твоят личен chat ID — вече е известен) |
| `ANTHROPIC_API_KEY` | от [console.anthropic.com](https://console.anthropic.com) → API Keys |
| `WHATSAPP_TOKEN` | от Meta App → WhatsApp → API Setup |
| `WHATSAPP_PHONE_NUMBER_ID` | от Meta App → WhatsApp → API Setup |
| `WHATSAPP_VERIFY_TOKEN` | измисляш си произволен низ, напр. `konvektomat-2024-xyz` |

> Ако още нямаш WhatsApp данните — нищо. Може първо да пуснем само Telegram частта,
> а WhatsApp да добавим после (виж "Само за Telegram" накрая).

---

## Стъпка 0 — Регистрация в Railway

1. Влез в [railway.com](https://railway.com) → **Login** → **Login with GitHub**.
2. Разреши на Railway достъп до твоя GitHub акаунт.

(Безплатният план е достатъчен за този бот. При нужда се ъпгрейдва с няколко долара.)

---

## Стъпка 1 — Създай проект от GitHub

1. В Railway натисни **New Project**.
2. Избери **Deploy from GitHub repo**.
3. Избери репозиторито **`task-manager-docker`**.
4. Когато попита за branch — избери **`claude/loving-hypatia-tjkdrp`**
   (там е качен ботът). *По-късно можеш да слееш в `main` и да минеш на `main`.*

Railway ще почне да опитва деплой — **първият път ще се обърка**, защото в repo-то
има няколко папки. Оправяме това в следващата стъпка.

---

## Стъпка 2 — Кажи на Railway коя папка да пусне

1. Цъкни на създадената услуга (service) → таб **Settings**.
2. Намери **Root Directory** и въведи:
   ```
   konvektomat-bot
   ```
3. Запази. Railway ще пусне нов деплой, този път върху правилната папка.

(Командите за стартиране вече са зададени в `konvektomat-bot/railway.json` — не пипай нищо друго.)

---

## Стъпка 3 — Въведи паролите (Variables)

1. В услугата отвори таб **Variables**.
2. Натисни **New Variable** (или **Raw Editor** за по-бързо) и добави една по една:

   ```
   TELEGRAM_BOT_TOKEN = <твоят токен>
   OPERATOR_CHAT_ID = 8785668541
   ANTHROPIC_API_KEY = <твоят ключ>
   CLAUDE_MODEL = claude-sonnet-4-6
   WHATSAPP_TOKEN = <твоят token>
   WHATSAPP_PHONE_NUMBER_ID = <твоят phone number id>
   WHATSAPP_VERIFY_TOKEN = <твоят измислен низ>
   ```

   > ⚠️ **НЕ** добавяй `PORT` — Railway го подава автоматично.

3. Запази. Railway автоматично прави нов деплой с новите стойности.

---

## Стъпка 4 — Провери, че работи

1. Таб **Deployments** → виж лога. Трябва да видиш редове като:
   ```
   HTTP сървър слуша на порт ...
   Telegram бот стартиран (polling).
   Готово. Модел: claude-sonnet-4-6 ...
   ```
2. **Тествай Telegram веднага:** напиши на бота от друг профил (като клиент).
   В твоя личен чат трябва да дойде драфт с бутони **✅ Send / ✏️ Rewrite**.

Ако Telegram работи — половината е готова. 🎉

---

## Стъпка 5 — Вземи публичния адрес (за WhatsApp)

1. Услуга → **Settings** → секция **Networking** → **Generate Domain**.
2. Railway ще ти даде адрес от вида:
   ```
   https://konvektomat-bot-production-xxxx.up.railway.app
   ```
3. Твоят **WhatsApp webhook URL** е този адрес + `/webhook/whatsapp`, напр.:
   ```
   https://konvektomat-bot-production-xxxx.up.railway.app/webhook/whatsapp
   ```

---

## Стъпка 6 — Свържи WhatsApp с този адрес

1. В [developers.facebook.com](https://developers.facebook.com) → твоето App → **WhatsApp** → **Configuration**.
2. При **Webhook** → **Edit**:
   - **Callback URL:** адресът от Стъпка 5 (с `/webhook/whatsapp` накрая)
   - **Verify token:** същата стойност като `WHATSAPP_VERIFY_TOKEN`
   - **Verify and save**
3. При **Webhook fields** → **Subscribe** на полето **messages**.
4. Тествай: прати съобщение по WhatsApp към бизнес номера → трябва да дойде драфт
   в твоя Telegram.

> ⚠️ **24-часов прозорец:** WhatsApp пуска свободни отговори само до 24ч след
> последното съобщение на клиента. За support обикновено е ОК (отговаряш бързо).

---

## Само за Telegram (ако още нямаш WhatsApp)

WhatsApp променливите са задължителни за старт в текущата версия. Ако искаш да
пуснеш първо само Telegram, два варианта:
- Попълни WhatsApp полетата с временни/празни placeholder стойности (ботът ще
  тръгне; WhatsApp просто няма да получава, докато не сложиш истинските данни), **или**
- Кажи ми и ще направя WhatsApp по желание (бот да тръгва и без тези променливи).

---

## По-късно: другата програма (task-manager) в Railway

Тя е по-сложна, защото има база данни. Накратко:

1. В същия Railway проект → **New** → **Database** → **Add PostgreSQL**.
2. **New** → **GitHub Repo** → пак същото repo, но **Root Directory = `backend`**
   (Railway ще ползва Dockerfile-а автоматично).
3. В **Variables** на backend услугата свържи базата (Railway позволява референции):
   ```
   DB_HOST = ${{Postgres.PGHOST}}
   DB_PORT = ${{Postgres.PGPORT}}
   DB_NAME = ${{Postgres.PGDATABASE}}
   DB_USER = ${{Postgres.PGUSER}}
   DB_PASSWORD = ${{Postgres.PGPASSWORD}}
   ```
4. **Generate Domain** за да я отваряш през браузър.

Ако стигнеш дотук и заседнеш — пиши ми, ще го минем заедно.

---

## Често срещани проблеми

| Симптом | Причина / решение |
|---|---|
| Деплоят гърми веднага | Провери **Root Directory = `konvektomat-bot`** (Стъпка 2) |
| В лога: "Липсва задължителна env променлива" | Не си сложил някоя променлива (Стъпка 3) |
| Telegram: грешка `409 Conflict` | Ботът върви на две места едновременно — спри локалния, остави само Railway |
| WhatsApp verify се проваля | `WHATSAPP_VERIFY_TOKEN` в Railway ≠ този в Meta; услугата трябва да върви |
| WhatsApp не получава | Не си натиснал **Subscribe** на полето **messages** |
