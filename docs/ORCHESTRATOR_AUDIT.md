# ORCHESTRATOR AUDIT — ответ на ВОПРОС 1. Дата: 2026-07-12. На ревью.

Аудит «оркестратора», перезаписавшего `tasks/results/TASK-001-RESULT.md`. Read-only, секреты не выводятся.

## (а) Что это за процесс, кто/когда запустил
- **Набор shell-скриптов** в этом же репо: `orchestrator/run_next.sh` → `run_claude_task.sh` → `review_cycle.sh`
  (+ `prompts/`, `tests/`). Созданы **2026-07-11** (mtime 17:50–18:36).
- **Механика:** `run_next.sh` берёт следующую задачу из `tasks/ready/TASK-*.md` → `run_claude_task.sh` запускает
  **standalone Claude CLI** на ней → двигает в `tasks/review/` → `review_cycle.sh` (Codex-ревью).
- **НЕ автономный демон:** cron — пусто, LaunchAgents — пусто. Запускается **ВРУЧНУЮ** (`./orchestrator/run_next.sh`).
- **Автор коммитов:** `Kammsk87 <…privaterelay.appleid.com>` — твоя же git-identity (глобальный git на Mac),
  НЕ отдельный бот. Коммиты: `9a7f3f2 TASK-001 completed`, `a979419/2d3fcdb TASK-002-ORCHESTRATOR-PREFLIGHT`.
- **Почему перезаписал мой RESULT:** оркестратор прогнал СВОЮ `TASK-001` (другое содержание — «Safety Guard
  Self-Test»), инструкция в промпте прямо велит «overwrite the task result report». Штатное поведение, не сбой.

## (б) Что имеет право писать
- Только **локальный Mac-репо** через инструменты Claude, запущенного с **жёстким allow/deny-листом**:
  - `--allowedTools Read,Edit,Write,Glob,Grep,Bash(git *),Bash(bash *),Bash(chmod *),Bash(mkdir *),Bash(test *)`
  - плюс safety-guards в `review_cycle.sh` (forbidden paths/commands: `.env`, ключи, `share/strategy-lab-7q4m2v/**`,
    strategy/risk/PnL и т.п. — тест `tests/test_safety_guards.sh` 34/34).
- Ветки `task/TASK-XXX`, коммиты локально. **Push сам не делает** (в `run_claude_task.sh`/`review_cycle.sh` нет
  `git push`; сеть не вызывается).
- Binary: standalone `/Users/aleksandr/.local/bin/claude` → `…/versions/2.1.207`. **VS Code-шим запрещён** явным
  guard'ом (`guard_claude_source`).

## (в) Доступ к ключам / исполнению — НЕТ
`--disallowedTools` блокирует: **`Bash(ssh *)`, `Bash(scp *)`, `Bash(curl *)`**, `sudo`, `systemctl`, `service`,
`journalctl`, `git reset`, `git clean`, `rm -rf`, `*BOTALIN_REAL_TRADING=true*`, `*deploy*`, `*API_KEY/SECRET/
PRIVATE_KEY/TOKEN*`, а также `Read(.env/.env.*/**.pem/**.key/**/id_rsa/**/id_ed25519)`.
→ **Оркестратор физически НЕ может:** дойти до сервера 167.233.205.87 (нет ssh/scp/curl), тронуть live systemd,
прочитать `.env`/ключи, запустить live-торговлю или деплой. Он заперт в Mac-репо с git + локальными файлами.

## ВЕРДИКТ по оркестратору
**НЕ дыра и НЕ забытый легаси — это твой активный, намеренно-песоченный dev-инструмент** (запуск Claude по задачам
с Codex-ревью, ручной, без ключей/сервера/исполнения). Правило №6 (mask) неприменимо: это не systemd-юнит и не
автономный процесс — он не работает, пока его не позовут. **Оставить.** Рекомендация: переименовать TASK-слоты, чтобы
его `TASK-001/002` не сталкивались с моими (коллизия RESULT — косметика, но путает историю).

## 🚨 ОТДЕЛЬНАЯ НАХОДКА (важнее оркестратора): GitHub PAT в открытом виде
- В `origin` этого репо (`.git/config`): `https://ghp_<REDACTED>@github.com/Kammsk87/kam-electro.git` — **живой
  GitHub Personal Access Token в URL**. Тот же токен — в `.claude/settings.local.json`.
- **Смягчающие факторы (проверено):** токена **НЕТ в git-истории** (`git log -S`=0 коммитов),
  `.claude/settings.local.json` **gitignored и НЕ отслеживается** → в пуш/на GitHub токен **не попадал**. Утечка
  **локальная** (файлы на диске), не публичная.
- **Риск:** любой локальный процесс с `git remote -v`/чтением config видит токен. Оркестраторный Claude имеет
  `Bash(git *)` → технически мог бы его прочитать (хотя ssh/curl для эксфильтрации заблокированы).
- **Отслеживаемый файл `quiz-game/docs/project-status-ai-handoff.md` содержит строку `ghp_`** — проверить, не
  реальный ли это (другой) токен, закоммиченный в историю.

### Рекомендации (по приоритету)
1. **РОТИРОВАТЬ токен `ghp_<REDACTED>` на GitHub немедленно** (он на диске в 2 местах; считать скомпрометированным).
2. Убрать токен из remote: перейти на SSH-remote ИЛИ git credential helper (не хранить в URL).
3. Вычистить из `.claude/settings.local.json`.
4. Проверить `quiz-game/docs/project-status-ai-handoff.md` на реальный токен в истории (если да — rewrite + rotate).
5. Оркестраторный allow-лист усилить: заблокировать `Bash(git remote*)`/`Bash(git config*)`, чтобы sandbox-Claude
   не мог прочитать даже локальный config.

**Статус:** оркестратор — безопасен, оставить. PAT — реальная (локальная) находка, требует ротации. На ревью.

**Решение оператора (2026-07-12):** оркестратор **одобрен, на паузе**; PAT **сохранён решением оператора** (утечка локальная, не в пуше). При расконсервации оркестратора — **TG-уведомление + обновление этого аудита** (роль подтверждена как «гонять botalin-задачи», но песочница без ssh не видит сервер — при активации потребуется решение по доступу).
