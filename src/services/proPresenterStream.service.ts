import { ProPresenterStreamModel } from '../models/ProPresenterStream.js'
import { TeamModel } from '../models/Team.js'

/**
 * Создать новый поток
 */
export async function createStream(data: {
  flowNumber: number
  email: string
  password: string
  chatLink?: string
  capacity?: number
}) {
  return ProPresenterStreamModel.create({
    flowNumber: data.flowNumber,
    email: data.email,
    password: data.password,
    chatLink: data.chatLink || '',
    capacity: data.capacity || 30,
    status: 'active',
  })
}

/**
 * Получить поток по номеру
 */
export async function getStreamByNumber(flowNumber: number) {
  return ProPresenterStreamModel.findOne({ flowNumber })
}

/**
 * Получить поток по id
 */
export async function getStreamById(id: string) {
  return ProPresenterStreamModel.findById(id)
}

/**
 * Все потоки, отсортированные по номеру
 */
export async function getAllStreams() {
  return ProPresenterStreamModel.find().sort({ flowNumber: 1 })
}

/**
 * Только активные потоки (доступные для выбора юзерами)
 */
export async function getActiveStreams() {
  return ProPresenterStreamModel.find({ status: 'active' }).sort({ flowNumber: 1 })
}

/**
 * Сколько команд реально сидит в потоке — считаем от источника правды (Team),
 * а не от отдельного счётчика, чтобы не рассинхронивалось.
 */
export async function getStreamOccupancy(flowNumber: number): Promise<number> {
  return TeamModel.countDocuments({
    'subscriptions.propresenter.status': 'active',
    'subscriptions.propresenter.meta.flowNumber': flowNumber,
  })
}

/**
 * Обновить поток (админ меняет пароль/почту/ссылку/статус)
 */
export async function updateStream(
  flowNumber: number,
  updates: Partial<{
    email: string
    password: string
    chatLink: string
    capacity: number
    status: 'active' | 'closed'
  }>
) {
  return ProPresenterStreamModel.findOneAndUpdate({ flowNumber }, { $set: updates }, { new: true })
}

/**
 * Следующий свободный номер потока (для создания нового)
 */
export async function getNextFlowNumber(): Promise<number> {
  const last = await ProPresenterStreamModel.findOne().sort({ flowNumber: -1 })
  return (last?.flowNumber || 0) + 1
}
