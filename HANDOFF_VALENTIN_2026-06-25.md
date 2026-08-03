# ПЕРЕДАЧА ДЕЛ — Ускоритель GSV
**Дата:** 25 июня 2026  
**От:** Александр (сессия с Claude)  
**Кому:** Валентин

---

## ✅ ЧТО СДЕЛАНО В ЭТОЙ СЕССИИ

### 1. Триал сокращён с 7 до 1 дня

**Затронуты файлы на обоих серверах:**

**Backend (31.76.56.125) — `/opt/vpn-api/main.py`:**
- `create_trial_user()`: `interval '7 days'` → `interval '1 day'`
- `/api/register` ответ: `"trial_days": 7` → `"trial_days": 1`
- `/api/admin/register` (Telegram-путь): `interval '7 days'` → `interval '1 day'`

**Telegram Bot (31.76.56.125) — `/opt/telegram-bot/bot.py`:**
- Строка `🎁 <b>7 дней бесплатно</b>` → `1 день бесплатно`
- Строка `бесплатный триал 7 дней` → `бесплатный триал 1 день`
- Строка `"trial": "Триал (7 дней)"` → `"Триал (1 день)"`

**Frontend (31.76.59.65) — все файлы в `/opt/uskoritel-frontend/app/`:**
- `register/page.tsx` — 3 вхождения
- `Nav.tsx` — 2 вхождения (кнопки в шапке)
- `page.tsx` — кнопка hero + карточка тарифа
- `login/page.tsx` — ссылка под формой
- `layout.tsx` — мета-описание (3 вхождения)

**Проверка на живом сайте:** `curl https://uskoritel-gsv.ru/ | grep "7 дней"` — вернул 0 совпадений.

---

### 2. Админ-дашборд: добавлены кнопки действий

**Проблема:** панель `/x1987admin/` показывала пользователей только для чтения — без возможности активировать, продлить или заблокировать.

**Что добавлено:**

**Backend (31.76.56.125) — `/opt/vpn-api/main.py`:**

Два новых эндпоинта с той же password-аутентификацией что и `panel1987`:

```
POST /api/secret/activate1987
Body: { "password": "...", "email": "...", "days": 30 }
→ Ставит status='active', expires_at = now() + N дней

POST /api/secret/block1987
Body: { "password": "...", "email": "..." }
→ Ставит status='blocked', expires_at = now(), удаляет токены
```

Также добавлены Pydantic-модели `SecretActivateRequest` и `SecretBlockRequest`.

**Frontend (31.76.59.65) — `/opt/uskoritel-frontend/app/x1987admin/page.tsx`:**

Полностью переписан. Добавлено:
- Кнопки **+30д**, **+90д**, **Блок** / **Разблок +30д** в каждой карточке пользователя
- После действия — автоматическое обновление списка (reloadUsers)
- Кнопка "↻ Обновить" в шапке
- Дни до конца подписки прямо в статус-бейдже (`ACTIVE · 61д`)

---

## ⚠️ ВАЖНО: НУЖНО СДЕЛАТЬ (не сделано)

### Сменить пароль админки
Сейчас работает **дефолтный пароль `1987`** — переменная `ADMIN_PANEL_PASSWORD` в `.env` не задана!

```bash
ssh root@31.76.56.125 "echo 'ADMIN_PANEL_PASSWORD=СЮДА_СИЛЬНЫЙ_ПАРОЛЬ' >> /opt/vpn-api/.env && systemctl restart vpn-api"
```

### bot.py — проверить AmneziaWG триал
Мы меняли только VLESS-упоминания триала в боте. Если в `bot.py` есть отдельные тексты про AWG-триал — проверь и поправь вручную:
```bash
grep -n "7\|trial" /opt/telegram-bot/bot.py | grep -v "def \|import \|#"
```

---

## 📊 ТЕКУЩЕЕ СОСТОЯНИЕ БД (на момент сессии)

30 пользователей:
- **3 active:** `ekbregionetrader@gmail.com` (до 25.08), `valtarnik13@yandex.ru` (до 29.06 — надо проверить, это ты или Max), `tg6129038519@uskoritel-gsv.ru` (до 31.07)
- **Остальные:** trial/blocked — в основном тестовые регистрации от разработки

---

## 🚀 ДЕПЛОЙ (справочно)

```bash
# Backend + Bot
scp main.py root@31.76.56.125:/opt/vpn-api/main.py
ssh root@31.76.56.125 "python3 -m py_compile /opt/vpn-api/main.py && systemctl restart vpn-api"

ssh root@31.76.56.125 "python3 -m py_compile /opt/telegram-bot/bot.py && systemctl restart telegram-bot"

# Frontend
scp page.tsx root@31.76.59.65:/opt/uskoritel-frontend/app/.../page.tsx
ssh root@31.76.59.65 "cd /opt/uskoritel-frontend && rm -rf .next && npm run build && systemctl restart uskoritel-frontend"
```

⛔ **НИКОГДА не использовать `sed` для правки Python-файлов**  
⛔ **НИКОГДА не менять `next.config.ts` rewrites**  
⛔ **НИКОГДА не регенерировать Reality-ключи Xray (сломает всех клиентов)**

---

## 🔗 ССЫЛКИ

- Сайт: https://uskoritel-gsv.ru
- Админка: https://uskoritel-gsv.ru/x1987admin/
- Бот: @uskoritelgsvbot
- Backend health: `curl http://31.76.56.125:8000/api/health`

---

**Подготовлено:** 25.06.2026
