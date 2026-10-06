/** Telegram destination for operational events. Override in the environment when moving the forum. */
export const LOG_GROUP_ID = Number(process.env.LOG_GROUP_ID || -1004463392579)
export const LOG_THREADS = {
  registration: Number(process.env.LOG_THREAD_REGISTRATION || 2),
  teams: Number(process.env.LOG_THREAD_TEAMS || 4),
  orders: Number(process.env.LOG_THREAD_ORDERS || 6),
  subscriptions: Number(process.env.LOG_THREAD_SUBSCRIPTIONS || 8),
  access: Number(process.env.LOG_THREAD_ACCESS || 10),
  errors: Number(process.env.LOG_THREAD_ERRORS || 12),
} as const
