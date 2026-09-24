import assert from 'node:assert/strict'
import { test } from 'node:test'
import { InlineKeyboard } from 'grammy'
import { renderScreen, registerScreens } from '../src/core/render.js'
import { setUiMessageId } from '../src/state/ui.js'
import { tutorialScreen, tutorials, tutorialsScreen } from '../src/screens/tutorials.js'

const cover = './public/tutorials.png'

test('tutorials list contains all nine lessons and back navigation', () => {
  const screen = tutorialsScreen()
  assert.equal(screen.photo, cover)
  assert.equal(tutorials.length, 9)
  assert.equal(screen.keyboard.inline_keyboard.length, 10)
  assert.match(screen.keyboard.inline_keyboard[9][0].callback_data || '', /a=back/)
})

test('missing tutorial video shows a placeholder and back button', () => {
  const screen = tutorialScreen(1, 'create-team')
  assert.equal(screen.video, undefined)
  assert.match(screen.caption, /Видео скоро появится/)
  assert.match(screen.keyboard.inline_keyboard[0][0].callback_data || '', /a=back/)
})

test('renderer edits the same message when switching video back to photo', async () => {
  const userId = 987654321
  const calls: string[] = []
  const keyboard = new InlineKeyboard().text('Назад', 'a=back')
  registerScreens({
    tutorial: () => ({ photo: cover, video: './public/tutorials/create-team.mp4', caption: 'Видео', keyboard }),
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
