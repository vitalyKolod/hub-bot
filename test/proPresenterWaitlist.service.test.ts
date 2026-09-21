import assert from 'node:assert/strict'
import test from 'node:test'
import { ProPresenterRequestBatchModel } from '../src/models/ProPresenterRequestBatch.js'
import { defaultRequestBatchTitle, getRequestBatchTitle, renameRequestBatch } from '../src/services/proPresenterWaitlist.service.js'

test('legacy request batch without title uses number fallback', async (t) => {
  t.mock.method(ProPresenterRequestBatchModel as any, 'findOne', () => ({ lean: async () => null }))
  assert.equal(defaultRequestBatchTitle(21), 'Заявки на поток №21')
  assert.equal(await getRequestBatchTitle(21), 'Заявки на поток №21')
})

test('request batch title rejects empty and overlong values before writing', async () => {
  await assert.rejects(() => renameRequestBatch(21, '   ', 9001), /не должно быть пустым/)
  await assert.rejects(() => renameRequestBatch(21, 'x'.repeat(101), 9001), /100 символов/)
})
