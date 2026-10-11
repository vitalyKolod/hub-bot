# HUB Mini App

Мобильное приложение и админка: [инструкция и функции](../docs/MOBILE_APP.md).

Быстрый старт из корня репозитория: `npm ci`, `npm --prefix web ci`, `npm run dev:app:demo`. Открыть http://localhost:3000. Используются временная MongoDB и симулятор Telegram.

Настройка настоящего тестового бота и авторизации: [WEB_API.md](../docs/WEB_API.md). Боевой вход использует подписанный Telegram initData. Токен бота хранится только на сервере.
