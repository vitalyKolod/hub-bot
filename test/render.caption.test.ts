import assert from 'node:assert/strict'
import test from 'node:test'
import { formatLegacyCaption } from '../src/core/render.js'

test('screen captions turn legacy asterisks into bold entities without shifting emoji offsets', () => {
  assert.deepEqual(formatLegacyCaption('🎬 *Заявка*\nУстройств: *20*'), {
    caption: '🎬 Заявка\nУстройств: 20',
    caption_entities: [
      { type: 'bold', offset: 3, length: 6 },
      { type: 'bold', offset: 21, length: 2 },
    ],
  })
})
