import { InlineKeyboard, type Context } from 'grammy'
import { apCb } from '../constants/admin-panel.js'
import { hasAdminPermission } from '../services/adminAccess.service.js'
import { TutorialLessonModel, TutorialTopicModel } from '../models/Tutorial.js'
import {
  createLesson, createTopic, deleteLesson, deleteTopic, getLesson, getTopic,
  listLessons, listTopics, moveLesson, moveTopic,
} from '../services/tutorial.service.js'

type InputState = {
  kind: 'topic-new' | 'topic-title' | 'lesson-new' | 'lesson-title' | 'lesson-description' | 'lesson-content'
  id?: string
  topicId?: string
}

type AdminSession = {
  tutorialAdminInput?: InputState
  tutorialAdminPanel?: { chatId: number; messageId: number }
  tutorialAdminPanelKind?: 'text' | 'media'
  tutorialAdminTextPanel?: { chatId: number; messageId: number }
}

function session(ctx: Context): AdminSession {
  return (ctx as Context & { session: AdminSession }).session
}

function callbackTarget(ctx: Context) {
  const message = ctx.callbackQuery?.message
  return message && 'chat' in message ? { chatId: message.chat.id, messageId: message.message_id } : undefined
}

async function show(ctx: Context, caption: string, keyboard: InlineKeyboard, media?: { type: 'photo' | 'video'; fileId: string }) {
  const state = session(ctx)
  const callback = callbackTarget(ctx)
  const target = callback || state.tutorialAdminPanel
  const sameActive = !callback || (callback.chatId === state.tutorialAdminPanel?.chatId && callback.messageId === state.tutorialAdminPanel?.messageId)
  const activeKind = sameActive ? state.tutorialAdminPanelKind : undefined

  if (media) {
    const payload = { type: media.type, media: media.fileId, caption }
    if (target && activeKind === 'media') {
      try {
        await ctx.api.editMessageMedia(target.chatId, target.messageId, payload, { reply_markup: keyboard })
        state.tutorialAdminPanel = target
        return
      } catch (error) {
        if (String((error as Error)?.message).includes('message is not modified')) return
      }
    }
    if (target && activeKind !== 'media') {
      state.tutorialAdminTextPanel = target
      await ctx.api.editMessageReplyMarkup(target.chatId, target.messageId, { reply_markup: new InlineKeyboard() }).catch(() => {})
    }
    const sent = media.type === 'video'
      ? await ctx.replyWithVideo(media.fileId, { caption, reply_markup: keyboard })
      : await ctx.replyWithPhoto(media.fileId, { caption, reply_markup: keyboard })
    state.tutorialAdminPanel = { chatId: sent.chat.id, messageId: sent.message_id }
    state.tutorialAdminPanelKind = 'media'
    return
  }

  const mediaTarget = activeKind === 'media' ? target : undefined
  const textTarget = mediaTarget ? state.tutorialAdminTextPanel : target
  if (textTarget) {
    try {
      await ctx.api.editMessageText(textTarget.chatId, textTarget.messageId, caption, { reply_markup: keyboard })
      if (mediaTarget) await ctx.api.deleteMessage(mediaTarget.chatId, mediaTarget.messageId).catch(() => {})
      state.tutorialAdminPanel = textTarget
      state.tutorialAdminPanelKind = 'text'
      state.tutorialAdminTextPanel = undefined
      return
    } catch (error) {
      if (String((error as Error)?.message).includes('message is not modified')) {
        state.tutorialAdminPanel = textTarget
        state.tutorialAdminPanelKind = 'text'
        return
      }
    }
  }
  const sent = await ctx.reply(caption, { reply_markup: keyboard })
  state.tutorialAdminPanel = { chatId: sent.chat.id, messageId: sent.message_id }
  state.tutorialAdminPanelKind = 'text'
  state.tutorialAdminTextPanel = undefined
  if (mediaTarget?.chatId === sent.chat.id) await ctx.api.deleteMessage(mediaTarget.chatId, mediaTarget.messageId).catch(() => {})
  else if (textTarget?.chatId === sent.chat.id) await ctx.api.deleteMessage(textTarget.chatId, textTarget.messageId).catch(() => {})
}

export { show as renderTutorialAdminPanel }

async function showTopics(ctx: Context) {
  const topics = await listTopics()
  const kb = new InlineKeyboard()
  for (const topic of topics) kb.text(topic.title, apCb('tuts', 'topic', String(topic._id))).row()
  if (await hasAdminPermission(ctx.from!.id, 'tutorials.edit')) kb.text('➕ Добавить тему', apCb('tuts', 'add-topic')).row()
  kb.text('‹ К управлению', apCb('menu'))
  await show(ctx, '🎬 ТУТОРИАЛЫ\n\nВыберите тему. Здесь можно добавлять и менять уроки.', kb)
}

async function showTopic(ctx: Context, id: string) {
  const topic = await getTopic(id)
  if (!topic) return showTopics(ctx)
  const lessons = await listLessons(id)
  const canEdit = await hasAdminPermission(ctx.from!.id, 'tutorials.edit')
  const kb = new InlineKeyboard()
  for (const lesson of lessons) {
    kb.text(`${lesson.published ? '✅' : '📝'} ${lesson.title}`, apCb('tuts', 'lesson', String(lesson._id))).row()
  }
  if (canEdit) {
    kb.text('➕ Добавить туториал', apCb('tuts', 'add-lesson', id)).row()
    kb.text('✏️ Название темы', apCb('tuts', 'edit-topic', id)).row()
    kb.text('⬆️', apCb('tuts', 'move-topic', id, 'up'))
      .text('⬇️', apCb('tuts', 'move-topic', id, 'down')).row()
    kb.text('🗑 Удалить тему', apCb('tuts', 'delete-topic', id)).row()
  }
  kb.text('‹ К темам', apCb('tuts'))
  await show(ctx, `${topic.title.toUpperCase()}\n\n${lessons.length ? 'Выберите туториал. 📝 — черновик, ✅ — опубликован.' : 'Туториалов пока нет.'}`, kb)
}

async function showLesson(ctx: Context, id: string) {
  const lesson = await getLesson(id)
  if (!lesson) return showTopics(ctx)
  const canEdit = await hasAdminPermission(ctx.from!.id, 'tutorials.edit')
  const kb = new InlineKeyboard()
  if (canEdit) {
    kb.text('✏️ Заголовок', apCb('tuts', 'edit-title', id)).row()
    kb.text('📝 Описание', apCb('tuts', 'edit-description', id)).row()
    kb.text('🖼 Заменить фото / видео', apCb('tuts', 'edit-content', id)).row()
    kb.text(lesson.published ? 'Снять с публикации' : 'Опубликовать', apCb('tuts', 'publish', id)).row()
    kb.text('⬆️', apCb('tuts', 'move-lesson', id, 'up'))
      .text('⬇️', apCb('tuts', 'move-lesson', id, 'down')).row()
    kb.text('🗑 Удалить туториал', apCb('tuts', 'delete-lesson', id)).row()
  }
  kb.text('‹ К теме', apCb('tuts', 'topic', String(lesson.topicId)))
  const caption = [lesson.title, lesson.description, lesson.published ? '✅ Опубликован' : '📝 Черновик'].filter(Boolean).join('\n\n').slice(0, 1024)
  const media = lesson.mediaType && lesson.mediaFileId
    ? { type: lesson.mediaType as 'photo' | 'video', fileId: lesson.mediaFileId }
    : undefined
  await show(ctx, caption, kb, media)
}

async function prompt(ctx: Context, input: InputState, text: string, back: string) {
  session(ctx).tutorialAdminInput = input
  const lesson = input.id && input.kind.startsWith('lesson-') ? await getLesson(input.id) : null
  const media = lesson?.mediaType && lesson.mediaFileId
    ? { type: lesson.mediaType as 'photo' | 'video', fileId: lesson.mediaFileId }
    : undefined
  await show(ctx, text, new InlineKeyboard().text('‹ Отмена', back), media)
}

export async function handleTutorialAdminCallback(ctx: Context, data: string): Promise<boolean> {
  if (!ctx.from || !(await hasAdminPermission(ctx.from.id, 'tutorials.view'))) {
    await ctx.answerCallbackQuery({ text: 'Нет доступа', show_alert: true }).catch(() => {})
    return true
  }
  session(ctx).tutorialAdminInput = undefined
  const [, , action, id, option] = data.split(':')
  const edit = async () => {
    if (!(await hasAdminPermission(ctx.from!.id, 'tutorials.edit'))) throw new Error('Недостаточно прав')
  }
  try {
    switch (action) {
      case undefined: await showTopics(ctx); break
      case 'topic': await showTopic(ctx, id); break
      case 'lesson': await showLesson(ctx, id); break
      case 'add-topic':
        await edit()
        await prompt(ctx, { kind: 'topic-new' }, 'Отправьте название новой темы одним сообщением.', apCb('tuts'))
        break
      case 'edit-topic':
        await edit()
        await prompt(ctx, { kind: 'topic-title', id }, 'Отправьте новое название темы.', apCb('tuts', 'topic', id))
        break
      case 'add-lesson':
        await edit()
        if (!await getTopic(id)) throw new Error('Тема не найдена')
        await prompt(ctx, { kind: 'lesson-new', topicId: id }, 'Отправьте заголовок нового туториала.', apCb('tuts', 'topic', id))
        break
      case 'edit-title':
      case 'edit-description':
      case 'edit-content': {
        await edit()
        const lesson = await getLesson(id)
        if (!lesson) throw new Error('Туториал не найден')
        const kind = action === 'edit-title' ? 'lesson-title' : action === 'edit-description' ? 'lesson-description' : 'lesson-content'
        const text = action === 'edit-title' ? 'Отправьте новый заголовок.' : action === 'edit-description' ? 'Отправьте новое описание. Для очистки отправьте «-».' : 'Отправьте одно видео или одну фотографию.'
        await prompt(ctx, { kind, id }, text, apCb('tuts', 'lesson', id))
        break
      }
      case 'publish': {
        await edit()
        const lesson = await getLesson(id)
        if (!lesson) throw new Error('Туториал не найден')
        if (!lesson.published && !lesson.mediaFileId) throw new Error('Сначала добавьте фото или видео')
        await TutorialLessonModel.updateOne({ _id: id }, { published: !lesson.published })
        await showLesson(ctx, id)
        break
      }
      case 'move-topic':
        await edit(); await moveTopic(id, option === 'up' ? -1 : 1); await showTopic(ctx, id); break
      case 'move-lesson':
        await edit(); await moveLesson(id, option === 'up' ? -1 : 1); await showLesson(ctx, id); break
      case 'delete-topic': {
        await edit()
        const topic = await getTopic(id)
        if (!topic) { await showTopics(ctx); break }
        const count = (await listLessons(id)).length
        await show(ctx, `Удалить тему «${topic.title}»${count ? ` и все её туториалы (${count})` : ''}?`,
          new InlineKeyboard().text('🗑 Да, удалить', apCb('tuts', 'confirm-topic', id)).row()
            .text('‹ Отмена', apCb('tuts', 'topic', id)))
        break
      }
      case 'confirm-topic': await edit(); await deleteTopic(id); await showTopics(ctx); break
      case 'delete-lesson': {
        await edit()
        const lesson = await getLesson(id)
        if (!lesson) { await showTopics(ctx); break }
        await show(ctx, `Удалить туториал «${lesson.title}»?`,
          new InlineKeyboard().text('🗑 Да, удалить', apCb('tuts', 'confirm-lesson', id)).row()
            .text('‹ Отмена', apCb('tuts', 'lesson', id)),
          lesson.mediaType && lesson.mediaFileId ? { type: lesson.mediaType as 'photo' | 'video', fileId: lesson.mediaFileId } : undefined)
        break
      }
      case 'confirm-lesson': {
        await edit()
        const lesson = await getLesson(id)
        if (lesson) await deleteLesson(id)
        await (lesson ? showTopic(ctx, String(lesson.topicId)) : showTopics(ctx))
        break
      }
      default: await showTopics(ctx)
    }
    await ctx.answerCallbackQuery().catch(() => {})
  } catch (error) {
    console.error('Tutorial admin callback error:', error)
    await ctx.answerCallbackQuery({ text: String((error as Error).message).slice(0, 190), show_alert: true }).catch(() => {})
  }
  return true
}

export async function handleTutorialAdminMessage(ctx: Context): Promise<boolean> {
  const state = session(ctx)
  const input = state?.tutorialAdminInput
  if (!input || ctx.chat?.type !== 'private' || !ctx.from) return false
  if (ctx.message?.text?.startsWith('/')) {
    state.tutorialAdminInput = undefined
    return false
  }
  if (!(await hasAdminPermission(ctx.from.id, 'tutorials.edit'))) {
    state.tutorialAdminInput = undefined
    return true
  }
  try {
    if (input.kind === 'lesson-content') {
      const video = ctx.message?.video
      const photo = ctx.message?.photo?.at(-1)
      if (!video && !photo) {
        await ctx.reply('Отправьте видео или фотографию.')
        return true
      }
      const lesson = await getLesson(input.id || '')
      if (!lesson) throw new Error('Туториал не найден')
      await TutorialLessonModel.updateOne({ _id: lesson._id }, {
        mediaType: video ? 'video' : 'photo', mediaFileId: (video || photo)!.file_id,
      })
      state.tutorialAdminInput = undefined
      await ctx.deleteMessage().catch(() => {})
      if (state.tutorialAdminPanelKind === 'text') await showTopic(ctx, String(lesson.topicId))
      await showLesson(ctx, String(lesson._id))
      return true
    }
    const value = ctx.message?.text?.trim()
    if (!value) {
      await ctx.reply('Отправьте текст одним сообщением.')
      return true
    }
    if (input.kind === 'lesson-description' ? value.length > 850 : value.length > 80) {
      await ctx.reply(input.kind === 'lesson-description' ? 'Описание должно быть короче 850 символов.' : 'Название должно быть короче 80 символов.')
      return true
    }
    if (input.kind === 'topic-new') {
      await createTopic(value)
      state.tutorialAdminInput = undefined
      await ctx.deleteMessage().catch(() => {})
      await showTopics(ctx)
    } else if (input.kind === 'topic-title') {
      if (!await getTopic(input.id || '')) throw new Error('Тема не найдена')
      await TutorialTopicModel.updateOne({ _id: input.id }, { title: value })
      state.tutorialAdminInput = undefined
      await ctx.deleteMessage().catch(() => {})
      await showTopic(ctx, input.id!)
    } else if (input.kind === 'lesson-new') {
      const lesson = await createLesson(input.topicId!, value)
      state.tutorialAdminInput = undefined
      await ctx.deleteMessage().catch(() => {})
      await showLesson(ctx, String(lesson._id))
    } else {
      if (!await getLesson(input.id || '')) throw new Error('Туториал не найден')
      await TutorialLessonModel.updateOne({ _id: input.id }, input.kind === 'lesson-title'
        ? { title: value }
        : { description: value === '-' ? '' : value })
      state.tutorialAdminInput = undefined
      await ctx.deleteMessage().catch(() => {})
      await showLesson(ctx, input.id!)
    }
  } catch (error) {
    console.error('Tutorial admin input error:', error)
    await ctx.reply(`❌ ${(error as Error).message}`)
  }
  return true
}
