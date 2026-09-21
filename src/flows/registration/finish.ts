import { renderScreen } from '../../core/render.js'
import { goHome } from '../../state/ui.js'

export async function finishRegistration(ctx: any, userId: number) {
  await ctx.api.sendMessage(
    userId,
    `🎉 *Регистрация завершена!*

Добро пожаловать в ХАБ!

Теперь вы можете:

- 👥 Создавать команды
- 📦 Приобретать подписки
- 🤝 Вступать в существующие команды

Приятного использования!`,
    {
      parse_mode: 'Markdown',
    }
  )

  goHome(userId)

  await renderScreen(ctx, userId, 'main', undefined, {
    forceNew: true,
  })
}
