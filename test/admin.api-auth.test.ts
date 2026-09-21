import assert from 'node:assert/strict'
import test from 'node:test'
import { requireAdminUser, AdminRequiredError } from '../src/api/auth/admin.js'

test('admin payment endpoints reject a non-admin identity at the shared guard', () => {
  assert.throws(() => requireAdminUser(9_999_999_999), AdminRequiredError)
})
