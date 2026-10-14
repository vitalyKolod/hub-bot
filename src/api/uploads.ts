import { InputFile, type Api } from 'grammy'
import { ApiError } from './http.js'

export { uploadSchema } from './uploadsSchema.js'
export async function uploadFile(api: Api, chatId: number, body: any, threadId?: number) {
  if (!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(body.fileBase64)) throw new ApiError(422, 'INVALID_FILE', 'Invalid base64')
  const buffer = Buffer.from(body.fileBase64, 'base64')
  if (!buffer.length || buffer.length > 10 * 1024 * 1024) throw new ApiError(422, 'INVALID_FILE', 'File size must be 1 byte to 10 MiB')
  const type = body.mimeType === 'video/mp4' ? 'video' : body.mimeType === 'application/pdf' ? 'document' : 'photo'
  const valid = body.mimeType === 'application/pdf' ? buffer.subarray(0, 5).toString() === '%PDF-' : body.mimeType === 'video/mp4' ? buffer.subarray(4, 8).toString() === 'ftyp' : body.mimeType === 'image/png' ? buffer.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10])) : buffer[0] === 255 && buffer[1] === 216 && buffer[2] === 255
  if (!valid) throw new ApiError(422, 'INVALID_FILE', 'File signature does not match MIME type')
  const file = new InputFile(buffer, body.fileName)
  const options = { message_thread_id: threadId, caption: body.text?.trim() || undefined }
  const sent = type === 'photo' ? await api.sendPhoto(chatId, file, options) : type === 'video' ? await api.sendVideo(chatId, file, options) : await api.sendDocument(chatId, file, options)
  const payload = 'photo' in sent ? sent.photo.at(-1) : 'video' in sent ? sent.video : 'document' in sent ? sent.document : null
  if (!payload) throw new ApiError(502, 'FILE_UNAVAILABLE', 'Telegram did not return uploaded file metadata')
  return { type: type as 'photo' | 'video' | 'document', telegramFileId: payload.file_id, fileName: body.fileName, mimeType: body.mimeType, messageId: sent.message_id }
}
