import { choice, string, type BodySchema } from './contract.js'
export const uploadSchema: BodySchema = {
  properties: { fileBase64: string(14_000_000), fileName: { ...string(100), pattern: '^[a-zA-Z0-9_.-]+$' }, mimeType: choice(['image/jpeg', 'image/png', 'application/pdf', 'video/mp4']), text: { ...string(1000), minLength: 0 } },
  required: ['fileBase64', 'fileName', 'mimeType'],
}
