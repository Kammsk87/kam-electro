# Перенос проекта Cashflow CRM в Codex на другой компьютер

Дата подготовки пакета: 2026-06-22.

## Что это

Локальный MVP CRM для офлайн-игры "Кэшфлоу":

- база клиентов из UDS;
- импорт игр и участников с сайта Cashflow196;
- учет игровых дат, столов, записей и посещений;
- Telegram-бот для тех, кто сам запустил бота;
- ручной учет коммуникаций и следующих касаний;
- ручная проверка, привязан ли номер телефона к Telegram.

## Текущее состояние базы

- Клиентов: 2636
- Клиентов с телефонами: 1993
- Игр в CRM: 15
- Записей/посещений: 35
- Задач бота: 6
- Telegram `chat_id` привязан: 2
- Telegram найден по номеру вручную: 33
- Telegram не найден по номеру вручную: 8
- Телефонов осталось проверить вручную: 1952
- Импортированные с сайта участники: 31
- Импортированные посещения с сайта: 33

Основная база лежит здесь:

```text
cashflow-crm-mvp/data/db.json
```

## Важные файлы

```text
cashflow-crm-mvp/server.mjs
```

Node.js сервер, API, хранение в `data/db.json`, Telegram Bot API worker.

```text
cashflow-crm-mvp/index.html
cashflow-crm-mvp/app.js
cashflow-crm-mvp/styles.css
```

Фронтенд CRM.

```text
cashflow-crm-mvp/data/db.json
```

Текущая рабочая база со всеми клиентами, играми, записями, задачами и результатами ручной проверки Telegram.

```text
cashflow-crm-mvp/data/names-and-phones.csv
cashflow-crm-mvp/data/telegram-phone-check-list.json
```

Списки телефонов для ручной проверки Telegram.

```text
cashflow-crm-mvp/import-telegram-phone-check-results.mjs
cashflow-crm-mvp/export-telegram-phone-check-list.mjs
```

Импорт ручных результатов Telegram-проверки и пересборка списка оставшихся номеров.

```text
cashflow-crm-mvp/import-site-games.mjs
cashflow-crm-mvp/reconcile-site-imports.mjs
```

Импорт игр с сайта Cashflow196 и склейка импортированных участников с UDS-клиентами по имени.

## Как запустить на новом компьютере

1. Распаковать архив проекта.
2. Открыть папку проекта в Codex.
3. Перейти в папку CRM:

```bash
cd cashflow-crm-mvp
```

4. Запустить сервер:

```bash
node server.mjs
```

Если `node` не установлен, установить Node.js LTS или попросить Codex найти доступный Node runtime.

5. Открыть:

```text
http://localhost:4173
```

## Запуск с паролем

```bash
HOST=0.0.0.0 CRM_USER=manager CRM_PASSWORD="your-password" node server.mjs
```

После этого:

```text
http://localhost:4173
```

Логин: `manager`

Пароль: тот, который указан в `CRM_PASSWORD`.

## Telegram-бот

В архиве нет настоящего Telegram bot token. Это специально: токен нельзя хранить в переносимом архиве.

Запуск с ботом:

```bash
TELEGRAM_BOT_TOKEN="your-token" CRM_USER=manager CRM_PASSWORD="your-password" node server.mjs
```

Текущий бот проекта: `@Cashflow_196_bot`.

Важно:

- бот не может первым написать человеку по номеру или username;
- бот может писать только тем, кто нажал `/start`;
- для ручной проверки телефонов на наличие Telegram бот не нужен.

## Ручная проверка Telegram по номерам

Для пользователя уже сделаны поля в CRM:

- `Telegram по номеру`: `Не проверяли`, `Найден`, `Не найден`;
- `TG user_id`;
- `TG username`;
- `Проверка TG`.

Фильтры в CRM:

- `Telegram найден по номеру`;
- `Telegram не найден по номеру`;
- `Telegram не проверяли`.

Чтобы импортировать новую ручную пачку, создать JSON по образцу:

```json
[
  { "phone": "+79000000000", "found": true, "username": "username" },
  { "phone": "+79000000001", "found": false }
]
```

Запустить:

```bash
node import-telegram-phone-check-results.mjs data/telegram-phone-check-results-manual-003.json
node export-telegram-phone-check-list.mjs
```

## Что уже импортировано с сайта

С сайта Cashflow196 перенесены последние 5 игр:

- `4857`, `4856`, `4855` за 10.06.2026 18:00, Гастромолл Главный;
- `4854` за 09.06.2026 18:00, P.l. Bar;
- `4853` за 07.06.2026 16:00, Гастромолл Главный.

В CRM это сгруппировано как 3 прошедших игровых дня со столами и посещениями.

## Что важно объяснить новому Codex

Пользователь говорит по-русски. Цель проекта: удобная CRM для клуба "Кэшфлоу", чтобы:

- видеть клиентов и историю игр;
- приглашать повторных игроков;
- отмечать ответы и дату следующего касания;
- учитывать Telegram-готовность;
- импортировать историю игр с сайта;
- постепенно проверять телефоны на наличие Telegram.

Не сбрасывать `data/db.json` без прямого запроса пользователя.

Не запускать старый `smoke-test.mjs` с авторизацией на рабочей базе: он делает `/api/reset`.

Не хранить Telegram bot token в файлах проекта.

## Быстрая проверка после переноса

```bash
node --check server.mjs
node --check app.js
node --check import-telegram-phone-check-results.mjs
node --check export-telegram-phone-check-list.mjs
```

Затем открыть CRM и проверить:

- в KPI есть `TG по номеру` и `TG не проверен`;
- в сегментах есть `Были за месяц`, `Были за полгода`, `Telegram найден по номеру`, `Telegram не найден по номеру`;
- поиск `Кукарцева` находит `Наталия Кукарцева` с телефоном и именем на сайте `Кукарцева Наталья`.
