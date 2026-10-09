import type { Context, SessionFlavor } from 'grammy'

export type SessionData = {
  payment: null | {
    paymentId?: string
    product: string
    teamId?: string
    renewalCampaignId?: string
    renewalDeviceIds?: string[]
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
  adminMode?: 'waiting_broadcast'
  broadcastDraft?: {
    audience: 'all' | 'stream'
    flowNumber?: number
    sourceChatId?: number
    messageIds: number[]
    mediaGroupId?: string
    isSending?: boolean
  }
  supportUiMessageId?: number
  supportUiOpened?: boolean
  supportDraft?: import('../services/supportContext.js').SupportDraft
  inSupportMode?: boolean
  isExtension: boolean
  supportThreadId?: number
  supportPanelMessageId?: number
  paymentReject?: {
    paymentId: string
    chatId: number
    messageId: number
  }
  waitingForPaymentRejectReason?: boolean
  activeConversationId?: string
  deviceDraft?: { mode: 'user_name' | 'replace_name' | 'admin_name'; teamId: string; flowNumber: number; name?: string; deviceId?: string; adminMessageId?: number }
}

export type MyContext = Context & SessionFlavor<SessionData>
