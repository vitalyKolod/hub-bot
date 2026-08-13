import type { Context, SessionFlavor } from 'grammy'

export type SessionData = {
  payment: null | {
    product: string
    teamId?: string
    method: string | null
    volunteerId?: number
    rubMethod?: string | null
    network?: string
    rubType?: 'card' | 'sbp'
    rubCardType?: 'mir' | 'mastercard'
    rubBank?: 'tbank' | 'ozon' | 'alfa'
  }
  waitingForReceipt?: boolean
  volunteerId?: number
  waitingForVolunteer?: boolean
  editingField?: 'fio' | 'city' | 'church' | 'prop_stream_no' | 'screens_end_date'
  adminMode?: 'broadcast' | 'waiting_broadcast'
  broadcastDraft?: {
    type: 'text' | 'photo' | 'video' | 'document'
    text?: string
    fileId?: string
  }
  inSupportMode?: boolean
  isExtension: boolean
  supportThreadId?: number
}

export type MyContext = Context & SessionFlavor<SessionData>
