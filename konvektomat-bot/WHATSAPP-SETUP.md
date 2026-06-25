# Откъде да взема WhatsApp данните (Meta Cloud API)

Това ръководство обяснява откъде идват трите WhatsApp променливи:
`WHATSAPP_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_VERIFY_TOKEN`.

> Това е най-бюрократичната част — минава през Meta (Facebook). Не бързай, върви
> ред по ред.

---

## Какво ти трябва преди това

- Личен **Facebook акаунт** (с него влизаш в Meta for Developers).
- За тестване — нищо повече. Meta дава безплатен **тестов номер**.
- За реална работа с клиенти — собствен телефонен номер, който **НЕ** се ползва
  в обикновено WhatsApp приложение, и **business verification** (виж накрая).

---

## Стъпки

1. Влез в **[developers.facebook.com](https://developers.facebook.com)**.
2. Горе вдясно: **My Apps** → **Create App**.
3. Тип на приложението: **Business** → Next.
4. Име на приложението (напр. „Konvektomat Bot") → Create.
   - Ако поиска **Business Portfolio / Meta Business Account** — създай един.
5. От списъка с продукти намери **WhatsApp** → **Set up**.
6. Отваря се **API Setup** (Quickstart). Тук са данните:

   | Променлива | Къде | Бележка |
   |---|---|---|
   | `WHATSAPP_PHONE_NUMBER_ID` | под тестовия номер пише **„Phone number ID"** | това е ЧИСЛО, не самият телефон |
   | `WHATSAPP_TOKEN` | поле **„Temporary access token"** | важи ~24 часа (за продукция → permanent, виж долу) |
   | `WHATSAPP_VERIFY_TOKEN` | **измисляш си го сам** | какъвто и да е низ, напр. `konvektomat-2024-xyz` |

---

## Тестване веднага (безплатно)

На същата **API Setup** страница има секция за получател (**„To" / Recipient**):

1. Добави **своя личен телефонен номер** (може до 5 номера).
2. Meta ще прати код за потвърждение на този номер.
3. След потвърждение тестовият номер може да праща на него.

Така можеш да тестваш целия поток без собствен бизнес номер.

---

## За продукция (когато тръгнеш на живо)

### 1) Permanent access token (защото временният важи 24ч)

1. **business.facebook.com** → **Business Settings**.
2. **Users → System Users** → **Add** → създай System User (роля Admin).
3. **Add Assets** → избери своето App → дай **Full control**.
4. **Generate New Token** → избери App → отметни permissions:
   - `whatsapp_business_messaging`
   - `whatsapp_business_management`
5. Копирай токена (показва се само веднъж!) → това е новият `WHATSAPP_TOKEN`.

### 2) Собствен телефонен номер + verification

- В **WhatsApp → API Setup → Add phone number** добави реален номер, който
  **не се ползва** в обикновено WhatsApp/WhatsApp Business приложение.
- Потвърди го по SMS/обаждане.
- Мини **Business Verification** на Meta (изисква фирмени документи; отнема дни).
- Чак след това можеш да пишеш на произволни клиенти (не само тестовите номера).

---

## Накрая: свържи webhook-а

След като ботът върви в Railway и имаш публичен адрес (виж `DEPLOY-RAILWAY.md`):

1. **WhatsApp → Configuration → Webhook → Edit**.
2. **Callback URL:** `https://<твоят-railway-адрес>/webhook/whatsapp`
3. **Verify token:** същата стойност като `WHATSAPP_VERIFY_TOKEN` в Railway.
4. **Verify and save**, после **Subscribe** на полето **messages**.

---

## Чести въпроси

| Въпрос | Отговор |
|---|---|
| Откъде е `WHATSAPP_VERIFY_TOKEN`? | Ти си го измисляш. Само трябва да съвпада в Railway и в Meta. |
| Токенът ми спря след 1 ден? | Бил е временен — направи permanent (System User по-горе). |
| Не мога да пиша на клиент? | В тестов режим пишеш само на потвърдените тестови номера. За всички — нужни са собствен номер + verification. |
| Какъв е „24-часовият прозорец"? | WhatsApp пуска свободни отговори само до 24ч след съобщение на клиента; после — само одобрени template-и. |
