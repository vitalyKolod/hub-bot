import assert from 'node:assert/strict'
import test from 'node:test'
import { requireAdminUser, AdminRequiredError } from '../src/api/auth/admin.js'

test('API shared admin guard rejects a non-admin identity', async () => {
  await assert.rejects(requireAdminUser(9_999_999_999), AdminRequiredError)
})
test('API shared admin guard resolves bootstrap role and permissions', async () => {
  const previous = process.env.ADMIN_IDS
  process.env.ADMIN_IDS = '99'
  try { const admin = await requireAdminUser(99); assert.equal(admin.role, 'superadmin'); assert.ok(admin.permissions.includes('payments.manage')) }
  finally { if (previous === undefined) delete process.env.ADMIN_IDS; else process.env.ADMIN_IDS = previous }
})
