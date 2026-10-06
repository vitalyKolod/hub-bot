import mongoose from 'mongoose'
import { TutorialLessonModel, TutorialSettingsModel, TutorialTopicModel } from '../models/Tutorial.js'

export const initialTopics = ['Начало работы', 'Команда', 'Подписка и доступ', 'ProPresenter', 'Помощь'] as const

export async function ensureTutorialTopics() {
  // The marker prevents deleted default topics from reappearing later.
  if (await TutorialSettingsModel.exists({ key: 'initial-topics-v1' })) return
  for (const [order, title] of initialTopics.entries()) {
    await TutorialTopicModel.updateOne(
      { seedKey: `initial-${order}` },
      { $setOnInsert: { seedKey: `initial-${order}`, title, order } },
      { upsert: true }
    )
  }
  await TutorialSettingsModel.updateOne({ key: 'initial-topics-v1' }, { $setOnInsert: { key: 'initial-topics-v1' } }, { upsert: true })
}

export async function listTopics() {
  await ensureTutorialTopics()
  return TutorialTopicModel.find().sort({ order: 1, _id: 1 }).lean()
}

export async function getTopic(id: string) {
  if (!mongoose.isValidObjectId(id)) return null
  return TutorialTopicModel.findById(id).lean()
}

export async function listLessons(topicId: string, publishedOnly = false) {
  if (!mongoose.isValidObjectId(topicId)) return []
  return TutorialLessonModel.find({ topicId, ...(publishedOnly ? { published: true } : {}) })
    .sort({ order: 1, _id: 1 }).lean()
}

export async function getLesson(id: string, publishedOnly = false) {
  if (!mongoose.isValidObjectId(id)) return null
  return TutorialLessonModel.findOne({ _id: id, ...(publishedOnly ? { published: true } : {}) }).lean()
}

export async function createTopic(title: string) {
  if ((await listTopics()).some((topic) => topic.title.trim().toLocaleLowerCase('ru') === title.trim().toLocaleLowerCase('ru'))) {
    throw new Error('Тема с таким названием уже есть')
  }
  const last = await TutorialTopicModel.findOne().sort({ order: -1 }).lean()
  return TutorialTopicModel.create({ title, order: (last?.order ?? -1) + 1 })
}

export async function createLesson(topicId: string, title: string) {
  const topic = await getTopic(topicId)
  if (!topic) throw new Error('Тема не найдена')
  const last = await TutorialLessonModel.findOne({ topicId }).sort({ order: -1 }).lean()
  return TutorialLessonModel.create({ topicId, title, order: (last?.order ?? -1) + 1 })
}

export async function moveTopic(id: string, direction: -1 | 1) {
  const topics = await listTopics()
  const i = topics.findIndex((topic) => String(topic._id) === id)
  const other = topics[i + direction]
  if (i < 0 || !other) return
  await TutorialTopicModel.updateOne({ _id: id }, { order: other.order })
  await TutorialTopicModel.updateOne({ _id: other._id }, { order: topics[i].order })
}

export async function moveLesson(id: string, direction: -1 | 1) {
  const lesson = await getLesson(id)
  if (!lesson) return
  const lessons = await listLessons(String(lesson.topicId))
  const i = lessons.findIndex((item) => String(item._id) === id)
  const other = lessons[i + direction]
  if (i < 0 || !other) return
  await TutorialLessonModel.updateOne({ _id: id }, { order: other.order })
  await TutorialLessonModel.updateOne({ _id: other._id }, { order: lessons[i].order })
}

export async function deleteTopic(id: string) {
  if (!mongoose.isValidObjectId(id)) return
  await TutorialLessonModel.deleteMany({ topicId: id })
  await TutorialTopicModel.deleteOne({ _id: id })
}

export async function deleteLesson(id: string) {
  if (mongoose.isValidObjectId(id)) await TutorialLessonModel.deleteOne({ _id: id })
}
