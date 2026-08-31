# HUB Bot: архитектура, UX и переносимая спецификация

Этот документ описывает не только расположение файлов, а фактическую модель бота: как Telegram-сообщение превращается в «экран», как устроены переходы, состояния, платежи, команды, команды пользователей, поддержка, админка, кастомные emoji и выдача подписок. Последний раздел формулирует требования так, чтобы их можно было вставить в задачу для другого проекта.

## 1. Что это за бот

Это Telegram-бот-витрина и кабинет подписочного сервиса. Его главная UX-идея — имитация одностраничного приложения внутри одного media message:

- каждый основной экран состоит из изображения, форматированной подписи и inline-клавиатуры;
- переход обычно не создаёт новое сообщение, а меняет фото, caption и кнопки существующего;
- есть «Назад» со стеком истории и «Главная», очищающая стек;
- действия, требующие текста или файла, временно выходят из экранного режима и используют session/состояние пользователя;
- коммерческие операции принадлежат не человеку, а его команде;
- оплата подтверждается вручную администратором по присланному чеку;
- после подтверждения бот активирует подписку и выдаёт одноразовую ссылку в закрытую группу.

По текущему коду доступны продукты ProPresenter, ProContent, CMG, Sunday Screens, CGS, StoryLoops, «Другое» и разовая покупка дополнительного участника.

## 2. Технологии

- Node.js/TypeScript, ESM (`type: module`), запуск через `tsx`.
- `grammy` — Bot API, middleware, session, команды, callback query, inline-клавиатуры, отправка/редактирование media.
- `@grammyjs/parse-mode` — `FormattedString`: безопасная сборка caption entities (bold, italic, code, spoiler, blockquote, custom emoji).
- `@grammyjs/menu` установлен, но фактическая навигация построена на `InlineKeyboard`; в изученном коде menu plugin не используется.
- MongoDB + Mongoose — пользователи, команды, корзины, приглашения, потоки ProPresenter, очередь и обращения поддержки.
- `dotenv` — окружение.
- `luxon` установлен; основная часть дат в UI и подписках всё равно обрабатывается нативным `Date`.
- `nodemon` — dev-перезапуск.

Внешних Codex/ChatGPT-плагинов в runtime-архитектуре нет. Под «плагинами» здесь разумно понимать grammY middleware и пакеты из `package.json`.

## 3. Слои проекта

| Слой | Файлы | Ответственность |
|---|---|---|
| Bootstrap | `index.ts`, `db.ts` | env, MongoDB, создание Bot, регистрация handlers, global error handler, long polling |
| Composition/router | `src/bot.ts` | session middleware, команды, приоритет callback’ов, маршрутизация сообщений, рассылка |
| UI engine | `src/core/render.ts`, `src/state/ui.ts`, `src/core/callback.ts` | registry экранов, редактирование одного сообщения, стек навигации, упаковка callback data |
| Screens | `src/screens/*` | чистые/почти чистые фабрики `{photo, caption, entities, keyboard}` |
| Feature handlers | `src/handlers/*`, `src/flows/*` | сценарии регистрации, оплаты, корзины, команд, ProPresenter, админки |
| Services | `src/services/*` | операции над моделями и Telegram-side effects сложных доменных сценариев |
| Persistence | `src/models/*` | Mongoose schemas |
| Design assets | `public/*`, `src/ui/emoji/*` | обложки экранов, custom emoji, format builders |
| Configuration | `src/config*`, `src/constants/*` | товары, реквизиты, ID групп/топиков, статусы и callback conventions |

`src/bot.ts` сейчас является composition root, но также содержит крупные реализации рассылки и часть legacy-сценариев. Это центральный диспетчер, а не тонкий router.

## 4. Модель «экранного приложения»

### Контракт экрана

Каждая screen factory возвращает:

```ts
type ScreenView = {
  photo: string
  caption: string
  keyboard: InlineKeyboard
  caption_entities?: MessageEntity[]
}
```

Registry создаётся в `initScreens()`: строковый `ScreenId` сопоставляется функции. Динамические экраны получают `userId`, `params` и иногда `ctx`; например, `team` получает teamId, загружает команду и строит персональный кабинет.

### Рендер

`renderScreen()`:

1. Находит factory по `screenId`.
2. Строит view.
3. Берёт `uiMessageId` пользователя из in-memory UI state.
4. Если ID есть и не указан `forceNew`, вызывает `editMessageMedia`, одновременно меняя картинку, caption, caption entities и клавиатуру.
5. `message is not modified` трактует как успешный no-op.
6. Если редактирование невозможно (старое/удалённое сообщение и т.п.), отправляет новое фото и запоминает новый message ID.

Именно это создаёт ощущение мобильного интерфейса, а не ленты сообщений. `forceNew` применяется после команд, завершения регистрации, создания команды и похожих разрывов сценария.

### Навигация

Для каждого userId в памяти хранится:

```ts
{ current, currentParams, stack, uiMessageId }
```

- `goTo` кладёт предыдущий `{screen, params}` в стек и открывает новый экран;
- `goBack` достаёт последний экран со всеми параметрами;
- `goHome` очищает стек и ставит `main`;
- callback `{a:'open', s:'team', p:teamId}` — обычный переход;
- `{a:'back'}` — возврат;
- `{a:'home'}` — абсолютный переход на главную.

Состояние UI не персистентное: после рестарта стек и `uiMessageId` теряются. Бизнес-состояние при этом остаётся в MongoDB.

### Callback protocol

Основной encoder превращает объект в query-string, например `a=open&s=team&p=...`. Строки URL-encode’ятся, объекты JSON→base64. Parser возвращает action, screen, payload и method. Для админки используется отдельный компактный протокол `ap:...`, потому что Telegram ограничивает `callback_data` 64 байтами.

Практический шаблон: callback должен содержать только команду и компактный идентификатор. Цены, права, состояние подписки и итог всегда повторно читаются на сервере.

## 5. Визуальный язык

### Композиция экранов

Основной экран — branded image из `public/` + caption + кнопки. Отдельные изображения есть для welcome, main, profile, team, cart, payment, legal, support и продуктовых разделов. В результате каждый переход меняет целую «карточку».

Типовая иерархия caption:

- крупный bold-заголовок;
- 1–2 предложения описания;
- expandable blockquote со списком преимуществ/условий;
- bold-цена или статус;
- секции через `━━━━━━━━━━━━━━` и древовидные строки `┗` на плотных экранах команды.

### Форматирование текста

Используются два подхода:

1. Markdown (`parse_mode: Markdown`) для простых сообщений регистрации, уведомлений и legacy-экранов.
2. `FormattedString` для сложных captions. Цепочка `.plain().bold().italic().code().spoiler().blockquote().emoji()` генерирует текст и точные `caption_entities`, которые передаются и при отправке, и при edit media.

В карточке команды логин выводится как code, пароль как spoiler. Это одновременно удобно копировать и безопаснее визуально. Динамический Markdown частично экранируется через `escapeUnderscore` или локальный `escapeMd`, но подходы сейчас неоднородны.

### Кастомные emoji и иконки кнопок

Есть два независимых механизма:

- В тексте `FormattedString.emoji(fallbackEmoji, customEmojiId)` создаёт entity `custom_emoji`.
- В inline-кнопке цепочка `.text(...).icon(customEmojiId)` добавляет Telegram custom emoji icon; `.style('success')` задаёт стиль поддерживаемой кнопки.

Также есть собственный mini-parser `:hub:` → fallback Unicode + entity по каталогу `CUSTOM_EMOJIS`. Идея хорошая для централизации, но текущий builder написан несовместимо с tuple-return parser и практически не интегрирован. Большинство экранов указывает ID напрямую.

Чтобы воспроизвести стиль, нужен централизованный semantic icon catalog (`home`, `back`, `payment`, `product.procontent`, `status.success`), а screen-код не должен знать числовые Telegram ID.

## 6. Полный пользовательский flow

### Вход, проверка подписки и онбординг

`/start` отправляет `welcome.jpg`, приветствие с тремя custom emoji entities и зелёную кнопку «СТАРТ».

Далее:

1. `sub:check` редактирует caption того же welcome message и показывает ссылку на канал + «Я подписался».
2. `subscribe:check` вызывает `getChatMember`; допустимы creator/administrator/member.
3. При успехе то же сообщение превращается в первую страницу онбординга.
4. Онбординг — четыре состояния на одном фото: возможности → объяснение HUB → юридические условия → приглашение зарегистрироваться.
5. На предпоследнем шаге кнопка согласия, на последнем — регистрация; кнопки стилизованы и снабжены custom icon.
6. Если пользователь уже зарегистрирован, confirm сразу ведёт на main; иначе запускается FSM регистрации.

Deep link `/start join_CODE` предварительно валидирует приглашение. Для зарегистрированного пользователя сразу показывает accept/reject; для нового сохраняет `pendingInviteCode`, проводит обычный onboarding/registration и показывает приглашение после подтверждения профиля.

### Регистрация

Персистентная FSM хранится в `User.reg` и `User.regStep`:

`none → in_progress/fio → city → church → confirm_registration → done`.

На каждом текстовом ответе текущее состояние читается из MongoDB, значение валидируется/сохраняется, следующий prompt отправляется отдельным сообщением. Финальный экран показывает ФИО, город, церковь и кнопки «Подтвердить»/«Изменить». Редактирование поля временно хранится в grammY session.

После подтверждения пользователь получает welcome-message, админ — карточку новой регистрации с `tg://user?id=...`, затем пользователю рендерится main или ожидающее приглашение.

### Главное меню и профиль

Главная ведёт в профиль, команды, поддержку и информационно-коммерческие разделы. Точный набор задан screen factory `mainScreen`.

Команда `/profile` открывает legacy-профиль пользователя. В текущей доменной модели главным кабинетом фактически стала карточка команды: подписки хранятся в `Team.subscriptions`, а не в User. Поэтому переносить следует team-centric вариант, а legacy user subscriptions удалить.

### Команды

`team_list` загружает все команды, где пользователь owner или member, и создаёт кнопку на каждую. Далее можно открыть описание механики или создать команду.

Создание:

1. informational screen;
2. callback `create_team` ставит persistent `inputMode=create_team`;
3. screen просит название;
4. следующий text handler проверяет длину 3–50;
5. создаётся Team с owner в members;
6. input mode очищается и открывается карточка команды.

Переход назад, на главный экран, в другой раздел или вызов навигационной команды также очищает input mode, поэтому следующий случайный текст не может стать названием команды.

Карточка команды показывает:

- все шесть подписок со статусом active/pending/expired/none;
- оставшиеся дни и точную дату;
- для ProPresenter — поток, login, password-spoiler;
- owner и всех участников (до 5), username, Telegram ID, отметку «ВЫ»;
- ссылки на продуктовые чаты только для реально активных подписок;
- owner-only кнопки добавления подписки и участника;
- renewal-кнопку только в последние 14 дней или после истечения; ProPresenter продлевается отдельно администратором.

### Каталог и корзина

`PRODUCTS` — единый каталог: id, display name, price, optional groupId, cartable. Контентные продукты cartable и используют общий `buildProductPurchaseKeyboard`: добавить/убрать из корзины, перейти в корзину, назад.

Catalog flow:

`team → add_subscription → content_menu → product card → add_to_cart → cart`.

Корзина одна на teamId. Item — subdocument со своим `_id`, product и status: `pending | in_review | active | rejected`. Экран выводит pending-позиции, общую цену, отдельную кнопку удаления на каждый item и checkout.

Перед добавлением и checkout повторно проверяется purchase lock: активный продукт нельзя купить повторно раньше окна продления в 14 дней. При checkout session получает `{product:'cart', teamId, method:null}` и начинается единый payment flow.

### Оплата

Покупка отдельного продукта или корзины сначала сохраняется в `session.payment`. Затем пользователь выбирает:

- рубли: card или SBP; далее тип карты/банк и конкретные реквизиты;
- crypto: TRC20 USDT, ERC20 USDT, TON USDT или Bybit.

Payment screens динамически показывают состав заказа, сумму, адрес/реквизиты и кнопки. После «Я оплатил» ставится `waitingForReceipt`; следующий photo/document трактуется как чек.

Receipt handler:

1. повторно восстанавливает продукт, teamId, method и позиции корзины из session/БД;
2. формирует админский caption с операцией, товарами, владельцем, username, user ID, team ID, способом и временем;
3. создаёт отдельный forum topic в admin group;
4. копирует туда фото или документ с кнопками accept/reject (для корзины — по каждой позиции);
5. пользователю ставит реакцию и сообщает, что чек отправлен;
6. после решения админа активируется/отклоняется подписка, item получает конечный статус, пользователю отправляется результат.

При accept год считается от текущего expiresAt, если подписка ещё активна, иначе от now. Для продукта с groupId Telegram создаёт invite link без временного TTL с лимитом одного вступления (`member_limit:1`). Для `add_member` вместо подписки создаётся deep link приглашения.

### ProPresenter

Этот продукт не кладётся в обычную корзину. У пользователя спрашивают, состоит ли команда в существующем потоке:

- «есть поток» → список открытых потоков → подтверждение номера → заявка в специальный admin topic → admin accept/reject;
- «нет потока» → подтверждение → waitlist → уведомление в другой admin topic.

При подтверждении поток является источником login/password/chatLink/expiresAt; эти данные копируются в `team.subscriptions.propresenter.meta`. Админка умеет создавать, редактировать, открывать/закрывать и удалять потоки, смотреть capacity/occupancy и назначать команды.

### Добавление участника

Owner с действующей подпиской покупает разовый `add_member`. После accept бот генерирует криптографический 8-символьный code и ссылку `?start=join_CODE`. Invite не ограничен по времени, но одноразовый: получатель проходит регистрацию при необходимости и принимает приглашение, после чего добавляется в members, invite помечается used, owner получает уведомление.

### Поддержка

Экран предлагает встроенную поддержку, helper bot и developer link. После `support:start` session включает `inSupportMode`. Любые поддерживаемые сообщения пользователя копируются в персональный forum topic support group. Для одного пользователя поддерживается максимум одно открытое обращение (partial unique index).

Админ отвечает прямо в topic; сообщение копируется пользователю. Реакции 👍/👎 сигнализируют доставку. Обе стороны могут закрыть обращение, после чего ticket обновляется и forum topic закрывается. В topic доступны быстрые карточки пользователя/его команды из админ-панели.

### Админка и рассылки

`/admin` доступна только admin IDs и содержит:

- broadcast всем зарегистрированным или участникам конкретного ProPresenter-потока;
- management UI пользователей, команд, подписок и потоков.

Рассылка поддерживает текст, фото, альбомы, видео, аудио, voice, documents, animations, stickers и исходные entities: draft хранит source chat/message IDs и доставляется через `copyMessage(s)`. Есть preview, add, replace, cancel. Получатели вычисляются из БД, ошибки считаются, между отправками есть простое throttling.

Management UI использует компактные callbacks, списки по 15 элементов, пагинацию, поиск и session-driven text inputs. Можно редактировать профиль, участников/owner команды, статусы/даты/meta подписок; создавать и изменять ProPresenter streams. Сервис перед save санитизирует старые некорректные subscription statuses.

## 7. Команды и типы входящих update

Команды:

- `/start [join_CODE]` — welcome/deep link;
- `/main` — новая главная карточка;
- `/profile` — профиль;
- `/team_list` — команды;
- `/support` — поддержка;
- `/admin` — admin menu;
- `/threadid` — ID текущего forum topic для админа.

Update routing имеет значение и должен сохранять приоритет:

1. session middleware;
2. commands;
3. callback query: admin panel → renew/support/registration/broadcast/verify → subscription/onboarding → generic packed actions;
4. broad message middleware для broadcast и support relay;
5. text: admin inputs, registration edit/FSM, persistent inputMode;
6. photo/document: receipt;
7. users_shared: legacy contact flow;
8. final broad message: support forwarding/fallback.

Чем шире matcher, тем позже он должен регистрироваться и тем аккуратнее обязан вызывать `next()`.

## 8. Данные и инварианты

- User: Telegram identity, registration FSM, persistent generic input mode, pending invite.
- Team: ownerId, max 5 members, `Map<productId, subscription>`, reminder keys.
- Subscription: status, expiresAt, free-form meta. Добавление нового продукта не требует изменения schema.
- Cart: teamId и items со статусами.
- TeamInvite: code, lifecycle, creator/consumer, expiry.
- ProPresenterStream: credentials, link, capacity, status, expiry, reminder keys.
- ProPresenterWaitlist: team, requester, assignment status.
- SupportTicket: user↔forum thread, open/closed lifecycle.

Ключевые server-side проверки: owner-only purchases, team existence, active subscription lock, cart non-empty, invitation expiry/capacity, admin guard, channel membership. В целевой реализации нужно добавить проверку membership команды на каждом screen/action с teamId, а не только owner в части handlers.

## 9. Напоминания

Reminder service периодически проверяет даты подписок и потоков, отправляет уведомления по контрольным точкам и хранит ключи уже отправленных напоминаний. Ключ включает дату окончания, поэтому продление автоматически начинает новый цикл. Запуск scheduler импортирован в bootstrap/composition, но фактическое подключение следует отдельно проверить: импорт сам по себе не означает периодический вызов.

## 10. Что в реализации особенно удачно

- Один редактируемый media message даёт чистый app-like UX.
- Screen factories отделяют представление от callback router и БД services.
- History хранит params, поэтому Back возвращает не просто тип экрана, а конкретную команду/товар.
- Team-centric subscriptions хорошо отражают совместный доступ.
- Product map позволяет добавлять товары без миграции Team schema.
- Ручное подтверждение платежа оформлено как понятный human-in-the-loop workflow.
- Forum topics естественно сегментируют оплаты и поддержку.
- `copyMessage` сохраняет форматирование и media без повторной сборки.
- Custom emoji используются не как декор в случайных местах, а как визуальные маркеры продуктов/действий.
- Deep links аккуратно переживают регистрацию нового пользователя.

## 11. Технический долг и найденные риски

Проверка `npx tsc --noEmit` сейчас не проходит и выдаёт много ошибок. Это важно: проект может работать через `tsx`, но типовая модель разошлась с runtime-кодом.

Основные проблемы:

- `index.ts` создаёт `Bot<Context>`, а `registerHandlers` требует `Bot<MyContext>`.
- В `ScreenId` отсутствуют фактически используемые IDs (`content_menu`, `procontent`, `cmg`, `cgs`, `storyloops`, `sunday_screens`, `propresenter_check` и др.); в `ActionId` отсутствуют `prop_no_stream`/`prop_has_stream`.
- Registry типизирован только синхронными factories, хотя большинство экранов async; есть импорт несуществующего `contentScreensScreen`.
- Несколько вызовов `renderScreen` передают `ctx` на место `options`.
- User schema больше не содержит legacy `subscriptions`, `volunteer`, `volunteers`, хотя profile/user/volunteer services продолжают их использовать.
- `buildAdminKeyboard` используется в bot.ts без импорта.
- Собственный emoji parser возвращает tuple, builders читают его как объект.
- `FormattedString.blockquote` вызывается с лишним вторым аргументом относительно установленной версии типов.
- UI state и grammY session находятся только в памяти: рестарт сбрасывает незавершённую оплату, поддержку, admin draft и историю.
- Реквизиты/crypto addresses частично зашиты в source; секреты и изменяемые бизнес-данные лучше держать в env/БД.
- `packCb` не проверяет 64-byte limit, а base64 payload легко его превышает.
- `parseCb` эвристически считает любую base64-похожую строку JSON, что делает протокол неоднозначным.
- Не все действия с teamId повторно проверяют, что текущий пользователь состоит в команде.
- Remove cart item сначала находит team, но не проверяет owner до удаления.
- Invite атомарно резервируется conditional update перед добавлением участника; при ошибке добавления резерв снимается. Для полной атомарности обеих записей всё ещё нужна MongoDB transaction.
- MAX 5 проверяется при validate, но не атомарно при add; админский add также не применяет лимит.
- Payment session может быть потеряна или перезаписана; order/payment следует хранить отдельной моделью с immutable amount и idempotency key.
- Admin reject quick-buy меняет только сообщение и не всегда фиксирует доменный pending/rejected status.
- `editMessageText` применяется к некоторым сообщениям, которые могли быть photo captions; нужен единый helper, выбирающий edit caption/text по типу.
- Markdown escaping разрозненный; пользовательские ФИО, название команды и username могут ломать entity parsing.
- Есть дублирующиеся/legacy payment branches и user-centric subscription код рядом с новой team-centric моделью.
- Нет test script, unit/integration тестов, lint/format pipeline и production build script.
- В bootstrap импортирован reminder runner, но в показанном старте он явно не вызывается.

## 12. Как строить аналогичный бот с нуля

Рекомендуемая целевая структура:

```text
src/
  app.ts                  # composition only
  features/<feature>/
    callbacks.ts
    handlers.ts
    screens.ts
    service.ts
    schema.ts
  ui/
    renderer.ts
    navigation-store.ts
    callback-codec.ts
    icons.ts
    format.ts
  domain/
    products.ts
    subscriptions.ts
  infrastructure/
    mongo.ts
    telegram.ts
    scheduler.ts
```

Реализация по порядку:

1. Определить typed `ScreenId`, `Action`, `ScreenParamsMap` и discriminated callback union.
2. Сделать renderer одного media message с fallback на новую отправку.
3. Сделать navigation store; для production хранить state/session в Mongo/Redis с TTL.
4. Вынести icon IDs, картинки, тексты кнопок и format helpers в design system.
5. Реализовать registration FSM с персистентным шагом.
6. Ввести team/workspace как контейнер доступа и subscription map.
7. Ввести catalog + generic product screen + generic cart, чтобы новый продукт добавлялся конфигом.
8. Ввести Order/PaymentAttempt вместо одной session.payment: amount snapshot, items, method, status, receipt file ID, admin decision, idempotency.
9. Связать ручную проверку с forum topics и атомарным accept/reject.
10. Сделать support ticket bridge через copyMessage.
11. Добавить RBAC middleware (`registered`, `teamMember`, `teamOwner`, `admin`) перед handlers.
12. Покрыть callback codec, FSM, renewal calculation, invite races и payment idempotency тестами.

## 13. Готовый переносимый промпт

Ниже спецификация, которую можно вставить в другой проект:

> Создай Telegram-бота на TypeScript + grammY в стиле экранного приложения. Каждый основной экран — одна брендированная картинка, caption с Telegram entities и inline-клавиатура. При навигации редактируй media/caption/keyboard одного сообщения; если edit невозможен, отправляй новое и сохраняй messageId. Реализуй typed registry экранов, стек Back с сохранением params и Home с очисткой стека.
>
> Вынеси screen factories, handlers, services, Mongoose models, product config, callback codec и UI design system в отдельные слои. Экран не должен мутировать данные. Handler оркестрирует, service обеспечивает доменные инварианты и БД. Все права проверяй на сервере повторно.
>
> Сделай обязательную проверку членства в Telegram-канале, четырёхстраничный onboarding внутри одного сообщения и персистентную регистрацию FSM: имя → город → организация → проверка/редактирование → done. Deep-link приглашение должно сохраняться и продолжаться после регистрации.
>
> Основная сущность доступа — команда/workspace: owner, участники, максимум N человек, Map подписок по productId. Карточка команды показывает статусы, даты, оставшиеся дни, credentials (логин code, пароль spoiler), ссылки на чаты только при активной подписке и owner-only actions.
>
> Сделай конфигурируемый каталог продуктов, карточки с brand image, formatted description, custom emoji, цена, Add/Remove cart. Корзина принадлежит команде, позиции имеют стабильные IDs и статусы. Активный продукт нельзя купить снова до окна продления.
>
> Платёжный flow: order snapshot → выбор fiat/crypto → уточнение сети/банка → реквизиты → «Я оплатил» → ожидание photo/document receipt. Создавай отдельный forum topic для проверки, отправляй receipt и кнопки accept/reject. Решение должно быть идемпотентным и атомарным. При accept активируй/продлевай подписку и создавай одноразовую Telegram invite link; при reject фиксируй статус и уведомляй пользователя.
>
> Сделай отдельный special-product flow с выбором существующей группы/потока или waitlist. Админ управляет потоками, capacity, credentials, chat link, expiry и назначением команд.
>
> Сделай оплачиваемые одноразовые приглашения: crypto-random code, единый TTL из config, deep link, atomic consume, expiry, usedBy, проверка лимита команды.
>
> Сделай поддержку как bridge personal chat ↔ forum topic: copy любых типов сообщений, реакции delivery success/error, одна открытая заявка на пользователя, close обеими сторонами. Сделай админку с RBAC, поиском, пагинацией, редактированием пользователей/команд/подписок/потоков и рассылками с preview по всем или выбранному сегменту.
>
> Визуальный стиль: крупный bold-заголовок, короткое описание, expandable blockquote со списком, bold-цена/статус, единые разделители; semantic custom emoji в тексте через caption_entities и в кнопках через icon(customEmojiId); success style на подтверждениях; строки Back/Home внизу. Все dynamic strings безопасно форматируй через entities, не конкатенацией Markdown.
>
> Сессии и navigation state храни в Redis/Mongo, платежи — отдельной персистентной моделью. Учитывай callback_data ≤64 bytes, используй короткие action codes и server-side lookup. Добавь global error middleware, structured logging, rate limiting, graceful shutdown, scheduler напоминаний и тесты критичных FSM/платёжных/пригласительных сценариев. TypeScript strict и `tsc --noEmit` должны проходить без ошибок.

## 14. Критерии визуального сходства

Похожесть достигается не конкретными картинками, а сочетанием правил:

- пользователь почти всегда видит одну актуальную карточку, а не десятки сообщений;
- у каждого раздела своя обложка и semantic icon;
- кнопки образуют вертикальную иерархию: primary action → secondary sections → Back/Home;
- информационная плотность caption умеренная, длинные списки визуально объединены blockquote;
- product IDs, icon IDs и palette поведения централизованы;
- переходы сохраняют контекст выбранной команды;
- любой долгий/ручной процесс немедленно даёт feedback: callback toast, reaction, pending status и последующее уведомление.

Это и есть переносимое ядро стиля текущего HUB-бота.
