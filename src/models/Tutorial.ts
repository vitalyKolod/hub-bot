import mongoose from 'mongoose'

const topicSchema = new mongoose.Schema({
  title: { type: String, required: true, trim: true },
  seedKey: { type: String, unique: true, sparse: true },
  order: { type: Number, required: true, index: true },
}, { timestamps: true })

const lessonSchema = new mongoose.Schema({
  topicId: { type: mongoose.Schema.Types.ObjectId, ref: 'TutorialTopic', required: true, index: true },
  title: { type: String, required: true, trim: true },
  description: { type: String, default: '' },
  mediaType: { type: String, enum: ['photo', 'video'], default: null },
  mediaFileId: { type: String, default: null },
  published: { type: Boolean, default: false, index: true },
  order: { type: Number, required: true, index: true },
}, { timestamps: true })

lessonSchema.index({ topicId: 1, order: 1 })

const settingsSchema = new mongoose.Schema({ key: { type: String, unique: true } })

export const TutorialTopicModel = mongoose.model('TutorialTopic', topicSchema)
export const TutorialLessonModel = mongoose.model('TutorialLesson', lessonSchema)
export const TutorialSettingsModel = mongoose.model('TutorialSettings', settingsSchema)
