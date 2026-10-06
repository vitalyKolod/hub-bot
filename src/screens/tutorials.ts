import { InlineKeyboard } from 'grammy'
import { packCb } from '../core/callback.js'
import type { ScreenView } from '../core/render.js'
import { getLesson, getTopic, listLessons, listTopics } from '../services/tutorial.service.js'

const cover = './public/tutorials.png'

export async function tutorialsScreen(): Promise<ScreenView> {
  const keyboard = new InlineKeyboard()
  for (const topic of await listTopics()) {
    keyboard.text(topic.title, packCb({ a: 'open', s: 'tutorial_topic', p: String(topic._id) })).row()
  }
  keyboard.text('◀️ НАЗАД', packCb({ a: 'back' }))
  return {
    photo: cover,
    caption: 'ТУТОРИАЛЫ\n\nВыберите тему, чтобы посмотреть уроки.',
    keyboard,
  }
}

export async function tutorialTopicScreen(_userId: number, id?: string): Promise<ScreenView> {
  const topic = await getTopic(id || '')
  const keyboard = new InlineKeyboard()
  if (topic) {
    for (const lesson of await listLessons(String(topic._id), true)) {
      keyboard.text(lesson.title, packCb({ a: 'open', s: 'tutorial', p: String(lesson._id) })).row()
    }
  }
  keyboard.text('◀️ НАЗАД', packCb({ a: 'back' }))
  return {
    photo: cover,
    caption: topic ? `${topic.title.toUpperCase()}\n\nВыберите туториал.` : 'Тема не найдена.',
    keyboard,
  }
}

export async function tutorialScreen(_userId: number, id?: string): Promise<ScreenView> {
  const lesson = await getLesson(id || '', true)
  const keyboard = new InlineKeyboard().text('◀️ НАЗАД', packCb({ a: 'back' }))
  if (!lesson || !lesson.mediaFileId) {
    return { photo: cover, caption: 'Туториал не найден.', keyboard }
  }
  return {
    photo: lesson.mediaType === 'photo' ? lesson.mediaFileId : cover,
    video: lesson.mediaType === 'video' ? lesson.mediaFileId : undefined,
    mediaIsFileId: true,
    caption: [lesson.title, lesson.description].filter(Boolean).join('\n\n').slice(0, 1024),
    keyboard,
  }
}
