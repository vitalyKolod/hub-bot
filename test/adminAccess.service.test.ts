import assert from 'node:assert/strict'
import test from 'node:test'

process.env.ADMIN_IDS = '9001'

const {
  ADMIN_PERMISSIONS, applyAdminPermissionChange, getAdminAccess,
  hasAdminPermission, isAdmin, isSuperAdmin,
} = await import('../src/services/adminAccess.service.js')
const { ADMIN_PERMISSION_META, ADMIN_ROLE_META } = await import('../src/constants/admin-access.js')

test('bootstrap env admin resolves as SUPERADMIN with every permission', async () => {
  const access = await getAdminAccess(9001)
  assert.equal(access?.role, 'superadmin')
  assert.equal(await isSuperAdmin(9001), true)
  assert.equal(await isAdmin(9001), true)
  assert.equal(await hasAdminPermission(9001, 'requests.edit'), true)
})

test('ordinary user has no admin access while database is disconnected', async () => {
  assert.equal(await isAdmin(123456), false)
  assert.equal(await hasAdminPermission(123456, 'requests.view'), false)
})

test('mutation permission automatically enables its view dependency', () => {
  assert.deepEqual(applyAdminPermissionChange([], 'teams.edit', true), ['teams.view', 'teams.edit'])
})

test('disabling view also disables dependent mutation permission', () => {
  assert.deepEqual(applyAdminPermissionChange(['teams.view', 'teams.edit'], 'teams.view', false), [])
})

test('every permission has a Russian UI mapping', () => {
  for (const permission of ADMIN_PERMISSIONS) {
    assert.ok(ADMIN_PERMISSION_META[permission].label)
    assert.ok(ADMIN_PERMISSION_META[permission].shortLabel)
  }
})

test('all admin roles have label, custom emoji and fallback emoji', () => {
  for (const role of ['superadmin', 'admin', 'consultant'] as const) {
    assert.ok(ADMIN_ROLE_META[role].label)
    assert.match(ADMIN_ROLE_META[role].addTitle, /^ДОБАВЛЕНИЕ /)
    assert.match(ADMIN_ROLE_META[role].confirmTitle, /^ДОБАВИТЬ .+\?$/)
    assert.match(ADMIN_ROLE_META[role].customEmojiId, /^\d+$/)
    assert.ok(ADMIN_ROLE_META[role].fallbackEmoji)
  }
})
