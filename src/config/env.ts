import dotenv from 'dotenv'
dotenv.config()

function required(name: string): number {
  const value = Number(process.env[name])
  if (!value) {
    console.error(`${name} не задан в .env`)
    process.exit(1)
  }
  return value
}

export const ADMIN_GROUP_ID = required('ADMIN_GROUP_ID')
export const CONTENT_GROUP_ID = required('CONTENT_GROUP_ID')
export const SUPPORT_GROUP_ID = required('SUPPORT_GROUP_ID')
export const SUNDAY_SCREENS_GROUP_ID = required('SUNDAY_SCREENS_GROUP_ID')
export const PROP_WAITLIST_THREAD_ID = required('PROP_WAITLIST_THREAD_ID')
export const PROP_STREAM_VERIFY_THREAD_ID = required('PROP_STREAM_VERIFY_THREAD_ID')

export const PRO_CONTENT_CHAT_LINK = process.env.PRO_CONTENT_CHAT_LINK!
export const CMG_CONTENT_CHAT_LINK = process.env.CMG_CONTENT_CHAT_LINK!
export const SUNDAY_SCREENS_CONTENT_CHAT_LINK = process.env.SUNDAY_SCREENS_CONTENT_CHAT_LINK!
export const CGS_CHAT_LINK = process.env.CGS_CHAT_LINK!
export const STORY_LOOP_CHAT_LINK = process.env.STORY_LOOP_CHAT_LINK!
