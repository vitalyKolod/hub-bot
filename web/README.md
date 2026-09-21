# HUB Mini App

## Local development

1. Start MongoDB and the API from the repository root: `npm run dev:api`.
2. Copy `.env.example` to `.env.local`.
3. For browser-only development set `ALLOW_DEV_AUTH=true` in the root API environment, then set `NEXT_PUBLIC_ALLOW_DEV_AUTH=true` and a registered Telegram ID in `web/.env.local`.
4. Run `npm run dev` inside `web/`.

Development auth is rejected by the backend whenever `NODE_ENV=production`. Normal Telegram launches always use signed `Telegram.WebApp.initData`.

## Telegram deployment

Deploy `web/` over HTTPS and proxy `/api/*` to the HUB API. Set `MINI_APP_URL` in the bot environment to the deployed HTTPS URL. `BOT_TOKEN` must only exist in the bot/API environment and must never use a `NEXT_PUBLIC_` prefix.
