export type SubscriptionKey = 'stream' | 'screens' | 'other'

export type UserSubscription = {
  key: SubscriptionKey
  title: string
  // для "Мой поток (№#)" — номер потока
  streamNo?: number
  active: boolean
}

const store = new Map<number, UserSubscription[]>()

export function getUserSubscriptions(userId: number): UserSubscription[] {
  return store.get(userId) ?? []
}

/**
 * Временный хелпер для теста.
 * Чтобы прямо сейчас проверить "как на картинке 1" — добавим демо-подписки пользователю.
 * Потом это уберём и подключим Mongo.
 */
export function seedDemoSubscriptions(userId: number) {
  if (store.has(userId)) return

  store.set(userId, [
    { key: 'stream', title: 'МОЙ ПОТОК (№#)', streamNo: 12, active: true },
    { key: 'screens', title: 'Контент для экранов', active: true },
    { key: 'other', title: 'ДРУГОЕ', active: true },
  ])
}

/** Можно очищать для проверки кейса "нет подписок" */
export function clearSubscriptions(userId: number) {
  store.delete(userId)
}
