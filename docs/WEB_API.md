# HUB API для веб-версии и админки

API и Telegram используют одну MongoDB, одни модели и существующие сервисы бота. В API нет копии каталога, подписок, прав админов или статусов платежей. Telegram polling запускается только через `index.ts`; API — отдельный процесс `api.ts`.

## Запуск без аккаунтов и production

Node.js 22+, `npm ci`, затем `npm run dev:api:demo`.

Стенд сам запускает временную MongoDB, создаёт тестовые профили и команду. Все обращения к Telegram заменены локальным симулятором. Реальная база и Telegram не используются. Данные исчезают после остановки. Первый запуск требует доступа к загрузке MongoDB; далее бинарник кешируется. Порт по умолчанию 3001, можно задать `API_PORT`.

```sh
curl http://127.0.0.1:3001/health
curl -H 'Authorization: dev 1001' http://127.0.0.1:3001/api/me
curl -H 'Authorization: dev 9001' http://127.0.0.1:3001/api/admin/session
curl -H 'Authorization: dev 9002' http://127.0.0.1:3001/api/admin/payments
curl -H 'Authorization: dev 1001' http://127.0.0.1:3001/api/sync
```

Профили: 1001 — владелец, 1002 — участник, 1003 — посторонний; 9001 — суперадмин, 9002 — консультант, 9003 — только поддержка. ID команды и платежа выводятся при запуске. Медиа в демо не скачиваются: фикстуры не содержат реальных Telegram-файлов.

`npm run test:api:integration` проверяет настоящий HTTP-сервер и временную MongoDB: права, изменения через сервис бота, синхронизацию, чеки, подтверждение/отклонение, поддержку, переписку по платежам и восстановление доставки после сбоя. `npm test` запускает основной набор регрессионных и HTTP-тестов без MongoDB.

Для существующего Mini App: запустить демо, в `web/.env.local` задать `NEXT_PUBLIC_ALLOW_DEV_AUTH=true`, `NEXT_PUBLIC_DEV_AUTH_USER_ID=1001`, выполнить `npm ci` и `npm run dev` внутри `web/`. Прокси уже направляет `/api/*` на localhost:3001. В существующем вебе профиль, команды, каталог и поддержка обновляются раз в 5 секунд в активной вкладке. Дизайн админки в этот PR не входит.

## Работа с настоящим тестовым ботом

Скопировать `.env.api.example` в `.env`, заменить URI на отдельную локальную БД и указать токен тестового бота и его чаты/темы. `npm run dev:api` запускает API; `npm run dev:stack` также запускает Telegram-бота и существующий веб. Регистрация доступна и в Telegram, и через `/api/registration`: сохранить fio/city/church, затем подтвердить через `/confirm` с `{ confirmed: true }`. Для боевого веб-входа нужен подписанный Telegram initData. Секреты не коммитить. Для существующего Telegram entrypoint также нужны ADMIN_ID, PAYMENT_CARD, PAYMENT_SBP и PAYMENT_RECEIVER_NAME из текущей конфигурации бота.

Production не изменён. Ветка предназначена для PR; слияние в main запускает существующий автоматический deployment workflow, поэтому до отдельного решения о выкладке PR нужно оставить открытым.

## Авторизация и права

Боевой запрос: `Authorization: tma <Telegram.WebApp.initData>` (также поддерживается схема `telegram`). Сервер проверяет HMAC, дату авторизации и Telegram ID. Срок initData — 15 минут; при 401 интерфейс должен предложить открыть Mini App заново. Токен бота и `initData` не писать в логи и не передавать как URL-параметры. Браузерный вход вне Telegram пока использует только локальный режим разработки; отдельный боевой login/session flow не добавлен.

`dev <telegramId>` разрешён только с явным `ALLOW_DEV_AUTH=true`, привязкой к loopback, локальным сокетом и `NODE_ENV` не равным `production`.

Права загружаются из того же `adminAccess.service`, что у Telegram. `ADMIN_IDS` — bootstrap superadmin; записи БД дают superadmin/admin/consultant. Каждое административное действие требует своего права. `/api/admin/session` возвращает роль, permissions и подписи прав: фронтенд строит меню из них, сервер независимо проверяет каждый запрос. Отключение прав действует со следующего запроса. Просмотр и управление оплатами, поддержкой, потоками и администраторами разделены. Чужие ресурсы пользователя возвращают 404; изменение корзины/устройств/команды требует владельца.

По умолчанию CORS не включён — использовать прокси одного origin. Для отдельного фронтенда указать точные origins в `API_ALLOWED_ORIGINS`. API слушает localhost; наружу публикуется через HTTPS reverse proxy. Лимит по пользователю — 120 запросов/минуту на процесс. Для нескольких API-реплик нужен общий лимитер в reverse proxy.

## Контракт

`GET /api/openapi.json` генерируется из того же реестра, что обрабатывает запросы. В нём все маршруты, поля JSON-тела, обязательность, ограничения и `x-hub-permission`. Добавление маршрута не требует вручную дублировать список в спецификации.

Успех: `{ data, meta?, applied?, delivery? }`. Ошибка: `{ error: { code, message, requestId } }`, также заголовок `X-Request-Id`. Некорректный JSON — 400, подпись — 401, права — 403, отсутствие — 404, неверный метод — 405, конфликт бизнес-состояния — 409, большой запрос — 413, неверный Content-Type — 415, валидация — 422, лимит — 429, Telegram недоступен — 502. Ошибка БД — 500. Нельзя отправлять произвольные Mongo-фильтры или поля модели.

Списки админки и истории поддерживают `page=0&limit=50` (limit 1–100) и возвращают `meta.total`. Списки со статусом поддерживают `status`. Пользователи и команды — `q`. Локальные ID MongoDB — строка из 24 hex-символов, Telegram ID/номер потока — положительное целое. Даты: ISO UTC, например `2026-11-01T12:00:00Z`; пустая строка очищает дату там, где предусмотрено. PATCH не принимает неизвестные поля.

## Пользователь

| Область | Маршруты |
| --- | --- |
| Регистрация | GET/PATCH `/api/registration`, POST `/api/registration/confirm` |
| Профиль | GET/PATCH `/api/me` (fio, city, church) |
| Каталог | GET `/api/products` — цены, названия и доступ из актуальных конфигурации/БД |
| Команды | GET/POST `/api/teams`, GET/PATCH `/api/teams/{teamId}` |
| Корзина | GET `/api/teams/{teamId}/cart`, POST `/cart/items`, DELETE `/cart/items/{id}` |
| Доступ | POST `/api/teams/{teamId}/access/{productId}`, GET `/subscriptions/{productId}/credentials` |
| Приглашения | GET `/api/teams/{teamId}/invites`, GET `/api/invites/{code}`, POST `/api/invites/{code}/accept` |
| Реквизиты | GET `/api/payment-options` — та же конфигурация, что в Telegram |
| Оплаты | GET/POST `/api/payments`, GET `/api/payments/{id}`, GET `/api/payments/{id}/receipt` |
| Поддержка | GET/POST `/api/support/conversations`, GET `/{id}`, POST `/{id}/messages`, POST `/{id}/close` |
| Устройства | GET `/api/teams/{teamId}/devices`, GET `/api/device-flows`, POST `/devices/{id}/replace`, POST `/device-requests` |
| Подтверждение существующего потока | GET/POST `/api/teams/{teamId}/stream-verifications` |
| Очередь ProPresenter | GET/POST `/api/teams/{teamId}/propresenter-requests` |
| Продление | GET `/api/renewals`, POST `/api/renewals/{id}/devices/{deviceId}/vote` |
| Яндекс 360 | GET `/api/yandex360`, POST `/api/yandex360/email-requests` |
| Туториалы | GET `/api/tutorials/topics`, GET `/topics/{id}/lessons`, GET `/lessons/{id}`, GET `/lessons/{id}/media` |
| Общение по оплатам | GET `/api/conversations`, GET `/{id}`, POST `/{id}/messages` |

Приглашение оплаченного участника одноразовое. Создавать бесплатное приглашение через веб нельзя. Если добавление участника не сохранилось, приглашение возвращается в работу.

Чек отправляется JSON: teamId, productId, currency (`rub`/`usd`), paymentMethod (ID из `/api/payment-options`, например `rub_card_mastercard`), operation (`purchase`/`renewal`), receiptBase64, fileName. Необязательно cartItemId, renewalCampaignId, renewalDeviceIds. Сервер вычисляет цену, проверяет владельца и позицию корзины, принимает PDF/PNG/JPEG до 5 MiB с проверкой сигнатуры. Произвольный Telegram file_id от клиента не принимается. ProPresenter приобретается через очередь; продление требует кампанию и выбранные устройства. Повторная отправка при уже pending/processing оплате возвращает существующее состояние. Для отклонённой позиции корзины используется административное возвращение оплаты на проверку.

Поддержка и общение по оплатам принимают `{ text }` длиной 1–4000 символов. Telegram-вложения можно скачивать через защищённые маршруты; поддержка принимает вложения через `POST /{id}/attachments`: fileBase64, fileName, mimeType, необязательный text. Принимаются PNG/JPEG/PDF/MP4 до 10 MiB с проверкой сигнатуры. Для переписки по оплатам веб-загрузка пока не добавлена. Все файлы идут через API после проверки доступа; токен Telegram не попадает в браузер. Максимум скачивания — 20 MiB.

## Админка

| Область | Маршруты и права |
| --- | --- |
| Сессия | GET `/api/admin/session` — любая активная роль |
| Пользователи | GET `/users`, GET/PATCH/DELETE `/users/{userId}` — users.view/edit |
| Команды | GET/POST `/teams`, GET/PATCH/DELETE `/teams/{teamId}`, POST `/owner`, POST `/members`, DELETE `/members/{userId}` — teams.view/edit |
| Подписки | GET `/subscriptions`; POST `/teams/{teamId}/subscriptions/{productId}/status, expiry, extend, reset` — subscriptions.view/edit |
| Оплаты | GET `/payments`, GET `/{id}`, GET `/{id}/receipt`; POST `/{id}/accept, reject, retry`; GET `/notifications` — payments.view/manage |
| Поддержка | GET `/support`, GET `/{id}`, POST `/{id}/messages, close, reopen` — support.view/reply |
| Устройства | GET `/devices`, POST `/devices`, POST `/{id}/replace, release` — streams.view/edit |
| Заявки на устройства | GET `/device-requests`, POST `/{id}/approve, reject` — requests.view/edit |
| Очередь ProPresenter | GET `/propresenter-requests`, POST `/{id}/cancel` — requests.view/edit |
| Потоки | GET/POST `/streams`, GET/PATCH `/streams/{flow}`, POST `/expiry, teams, renewals`, GET `/credentials`; POST `/streams/from-waitlist` — streams.view/edit |
| Продления | GET `/renewals`, POST `/renewals/{id}/complete` — streams.view/edit |
| Яндекс 360 | GET/POST `/yandex360/streams`, PATCH `/streams/{id}`, GET/POST `/members`, PATCH `/members/{id}`, POST `/link, emails`, POST `/emails/{emailId}/status`; GET `/requests`, POST `/requests/{id}/approve, reject` — streams.* или requests.* |
| Туториалы | GET/POST `/tutorials/topics`, PATCH/DELETE `/topics/{id}`, GET/POST `/topics/{id}/lessons`, PATCH/DELETE `/lessons/{id}`, POST `/topics/{id}/move`, POST `/lessons/{id}/move` — tutorials.view/edit |
| Подтверждения потоков | GET `/stream-verifications`, POST `/{id}/approve, reject` — requests.view/edit |
| Медиа | POST `/uploads` с purpose tutorial/broadcast; POST `/tutorials/lessons/{id}/media` с uploadId — tutorials.edit или broadcasts.send |
| Рассылки | GET/POST `/broadcasts`, GET/PATCH `/{id}`, POST `/{id}/send, cancel` — broadcasts.send |
| Администраторы | GET/POST `/admins`, POST `/admins/{userId}/permissions`, DELETE `/admins/{userId}` — admins.view/manage и ограничения суперроли |
| Общение по оплатам | POST `/payments/{id}/conversation`, GET `/conversations`, GET `/{id}`, POST `/{id}/messages, close, reopen` — payments.view/manage |

В таблице маршруты относительно `/api/admin`. Точные тела запросов — в OpenAPI. В списках не выдаются пароли потоков, внутренние поля Telegram, режим ввода или токены. Участнику доступны credentials только действующей собственной подписки; администратору — отдельный запрос с streams.edit.

Подтверждение/отклонение оплаты вызывает существующие `acceptPayment`/`rejectPayment`: атомарный захват pending, применение подписки/места/продления, аудит, обновление корзины. Повторный запрос возвращает `applied: false`, текущий статус и не применяет подписку повторно. Telegram-карточка обновляется после решения. Ошибка доставки уведомления не отменяет подтверждённую оплату: намерение сохраняется в ApiNotification, worker повторяет с задержкой и восстанавливается после перезапуска. Статус виден в `/api/admin/notifications`. Telegram не поддерживает ключ идемпотентности sendMessage: при обрыве связи после принятия сообщения возможна повторная доставка. Намерение доставки сохраняется внутри документа Payment вместе с конечным решением; worker восстановит запись очереди, если процесс упал до её создания. Для нескольких доменных документов и Telegram нельзя обещать exactly-once при авариях; существующий сервис платежей использует атомарный захват статуса и проверки повторного применения.

Обращения поддержки сохраняются в SupportTicket/SupportMessage; переписка по оплатам — Conversation/ConversationMessage. Новые Telegram-сообщения по оплатам сохраняют текст и вложения для веба. Старые записи, содержащие только Telegram ID сообщений, автоматически восстановить нельзя. Закрытие/возобновление использует сервис бота и его Telegram-тему. Нотификации заявок возвращают `delivery.status`; автоматический outbox пока покрывает только решения по платежам.

## Синхронизация и будущие изменения

`GET /api/sync` возвращает `{ revision, changed, pollAfterMs: 5000, snapshot }`. Передавать `?since=<revision>`: если состояние не изменилось, snapshot равен null. Снимок охватывает профиль, команды, подписки, корзины, оплаты, устройства и заявки, обращения, Яндекс 360, каталог и опубликованные туториалы. `/api/admin/sync` выдаёт только разделы разрешённых прав. Изменения через сервисы Telegram и даже прямые изменения БД видны при следующем опросе; перезапуск не теряет события. Списки в снимках ограничены 100 последними записями; для полной истории использовать пагинацию. Открытую переписку опрашивать отдельным GET, а не ожидать полный текст сообщений в sync. Снимки включают кампании продления и заявки подтверждения потоков; подробности потоков, переписок и Яндекс обновлять через их отдельные маршруты.

Для фронтенда есть `src/api/client.ts`: HubApiClient.request сохраняет envelope, HubApiError — код/статус/requestId, watchState опрашивает без перекрывающихся запросов, останавливается по 401/403, отменяется при уходе со страницы. Пример:

```ts
const client = new HubApiClient('', () => `tma ${Telegram.WebApp.initData}`)
const stop = client.watchState(false, snapshot => updateStore(snapshot), error => showError(error))
// После успешного изменения обновить затронутый запрос сразу; stop() при unmount.
```

Новый стандартный продукт в `PRODUCTS` автоматически появится в API и Map-подписках. Изменение цены/названия/статуса/прав используется обеими поверхностями. Новый процесс (новый вид заявки, новое подтверждение, новое действие) требует общего сервиса, явного API-маршрута/permission и соответствующего UI: API не может автоматически создать интерфейс для неизвестной функции. Телеграм-хендлеры должны оставаться адаптерами над общими сервисами; не добавлять новую бизнес-логику только в callback.

Регистрация и подтверждения существующего потока используют общие сервисы с Telegram. Заявки из обеих версий сохраняются в одной очереди. Медиа туториалов загружаются через защищённый API; клиент получает mediaId, а не file_id. Рассылка сначала создаётся как черновик с зафиксированными получателями; отправка требует `{ confirmed: true }`. Фоновый worker хранит прогресс API-рассылки, учитывает Telegram retry_after и прекращает отправку после отмены или отзыва прав. После аварии между отправкой и сохранением прогресса возможны дубли. История новых Telegram-рассылок тоже доступна в API, но незавершённые Telegram-рассылки после рестарта автоматически не возобновляются. Telegram-специфическая модерация чатов остаётся в боте; боевой вход через обычный браузер и дизайн админки — отдельные следующие задачи.

## Проверки перед будущей выкладкой

`npm ci`, `npm run build`, `npm run typecheck:api`, `npm test`, `npm run test:api:integration`. Затем CI PR должен пройти. Исправлены конфликтующие объявления индексов в Payment, SupportTicket и ProPresenterDeviceRequest: обычный и частичный уникальный индекс больше не создаются под одним именем. На новой базе инициализация проходит полностью.

Перед будущей выкладкой выполнить `npm run check:api:indexes` с URI нужной БД. Команда только читает индексы: ничего не создаёт и не удаляет. Старые неуникальные индексы под теми же именами требуют отдельного плана миграции после проверки дублей и резервной копии. API останавливает запуск при ошибке инициализации моделей/индексов. Производственная база в этом PR не изменяется.

Новые поля ConversationMessage необязательны и совместимы со старыми документами. Новые коллекции уведомлений, медиа, рассылок и подтверждений потоков требуют прав на создание коллекций/индексов. `/health` — жив процесс, `/ready` — есть MongoDB. Перед production отдельно проверить интеграцию тестового Telegram, реальные права bot admin, файлы, темы, платёжные реквизиты фронтенда и поведение при частичных сбоях; локальные тесты используют симулятор Telegram.
