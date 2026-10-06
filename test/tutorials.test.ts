import assert from 'node:assert/strict'
import { test } from 'node:test'
import { InlineKeyboard } from 'grammy'
import { renderScreen, registerScreens } from '../src/core/render.js'
import { setUiMessageId } from '../src/state/ui.js'
import { tutorialScreen } from '../src/screens/tutorials.js'
import { initialTopics } from '../src/services/tutorial.service.js'
import { TutorialLessonModel } from '../src/models/Tutorial.js'
import { renderTutorialAdminPanel } from '../src/handlers/tutorialAdmin.handlers.js'

const cover = './public/tutorials.png'

test('initial tutorial topics follow the user journey', () => {
  assert.deepEqual(initialTopics, ['Начало работы', 'Команда', 'Подписка и доступ', 'ProPresenter', 'Помощь'])
})

test('invalid tutorial id does not expose media', async () => {
  const screen = await tutorialScreen(1, 'invalid')
  assert.equal(screen.video, undefined)
  assert.match(screen.caption, /Туториал не найден/)
  assert.match(screen.keyboard.inline_keyboard[0][0].callback_data || '', /a=back/)
})

test('published tutorial renders its Telegram video id and description', async () => {
  const original = TutorialLessonModel.findOne
  ;(TutorialLessonModel as any).findOne = () => ({ lean: async () => ({
    title: 'Первый шаг', description: 'Откройте меню', mediaType: 'video', mediaFileId: 'telegram-video-id', published: true,
  }) })
  try {
    const screen = await tutorialScreen(1, '507f1f77bcf86cd799439011')
    assert.equal(screen.video, 'telegram-video-id')
    assert.equal(screen.mediaIsFileId, true)
    assert.equal(screen.caption, 'Первый шаг\n\nОткройте меню')
  } finally {
    TutorialLessonModel.findOne = original
  }
})

test('admin topic lists edit text and returning from a video restores the same message', async () => {
  const keyboard = new InlineKeyboard().text('➕ Добавить тему', 'ap:tuts:add-topic')
  const edits: Array<{ id: number; text: string; options: any }> = []
  const deleted: number[] = []
  let mediaSent = 0
  const ctx = {
    session: {},
    callbackQuery: { message: { chat: { id: 1 }, message_id: 7 } },
    api: {
      editMessageText: async (_chatId: number, id: number, text: string, options: any) => { edits.push({ id, text, options }) },
      editMessageReplyMarkup: async () => {},
      editMessageMedia: async () => { throw new Error('Video should not be edited while opening') },
      deleteMessage: async (_chatId: number, id: number) => { deleted.push(id) },
    },
    replyWithVideo: async () => { mediaSent++; return { chat: { id: 1 }, message_id: 8 } },
    reply: async () => { throw new Error('Unexpected new text message') },
  }
  await renderTutorialAdminPanel(ctx as any, 'Темы', keyboard)
  assert.equal(edits[0].id, 7)
  assert.equal(edits[0].options.reply_markup.inline_keyboard[0][0].text, '➕ Добавить тему')
  await renderTutorialAdminPanel(ctx as any, 'Урок', keyboard, { type: 'video', fileId: 'file-id' })
  assert.equal(mediaSent, 1)
  ctx.callbackQuery.message.message_id = 8
  await renderTutorialAdminPanel(ctx as any, 'Темы', keyboard)
  assert.equal(edits.at(-1)?.id, 7)
  assert.deepEqual(deleted, [8])
})

test('renderer edits the same message when switching video back to photo', async () => {
  const userId = 987654321
  const calls: string[] = []
  const keyboard = new InlineKeyboard().text('Назад', 'a=back')
  registerScreens({
    tutorial: () => ({ photo: cover, video: 'telegram-video-id', mediaIsFileId: true, caption: 'Видео', keyboard }),
    tutorials: () => ({ photo: cover, caption: 'Список', keyboard }),
  } as any)
  setUiMessageId(userId, 55)
  const ctx = {
    session: {},
    api: {
      editMessageMedia: async (_chatId: number, messageId: number, media: { type: string }) => {
        assert.equal(messageId, 55)
        calls.push(media.type)
      },
    },
    replyWithVideo: async () => { throw new Error('Unexpected new video message') },
    replyWithPhoto: async () => { throw new Error('Unexpected new photo message') },
  }
  await renderScreen(ctx, userId, 'tutorial')
  await renderScreen(ctx, userId, 'tutorials')
  assert.deepEqual(calls, ['video', 'photo'])
})
