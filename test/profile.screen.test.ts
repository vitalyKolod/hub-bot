import assert from 'node:assert/strict'
import test from 'node:test'

import { mainScreen } from '../src/screens/main.js'
import {
  buildProfileKeyboard,
  buildProfileMessage,
  type ProfileMember,
} from '../src/screens/profile.js'
import { PROFILE_ICONS } from '../src/ui/emoji/icons.js'

const user = {
  fio: 'Виталий Колодченко',
  username: 'vitaly_kolodchenko',
  city: 'ст. Ханская',
  church: 'Спасение',
}

function member(telegramId: number, fio: string): ProfileMember {
  return { telegramId, fio, role: 'member', status: 'active' }
}

test('user without teams gets a complete informational profile', () => {
  const profile = buildProfileMessage(100, user, [])

  assert.match(profile.text, /Виталий Колодченко/)
  assert.match(profile.text, /@vitaly_kolodchenko/)
  assert.match(profile.text, /Город: ст\. Ханская/)
  assert.match(profile.text, /Церковь: Спасение/)
  assert.match(profile.text, /Команд: 0/)
  assert.match(profile.text, /Пока у вас нет команд/)
})

test('owned team uses Team members and subscriptions and displays volunteers', () => {
  const profile = buildProfileMessage(100, user, [
    {
      name: 'Спасение',
      ownerId: 100,
      subscriptions: new Map([['procontent', {}], ['cmg', {}]]),
      members: [
        { telegramId: 100, role: 'owner', status: 'active', fio: user.fio },
        member(101, 'Иван Иванов'),
      ],
    },
  ])

  assert.match(profile.text, /Роль: Владелец/)
  assert.match(profile.text, /Подписок: 2/)
  assert.match(profile.text, /Волонтёров: 1/)
  assert.match(profile.text, /Иван Иванов/)
})

test('membership in another team is displayed as volunteer', () => {
  const profile = buildProfileMessage(100, user, [
    {
      name: 'Свет миру',
      ownerId: 200,
      subscriptions: new Map(),
      members: [member(100, user.fio)],
    },
  ])

  assert.match(profile.text, /Роль: Волонтёр/)
  assert.doesNotMatch(profile.text, /Волонтёры:/)
})

test('profile never exposes technical user fields', () => {
  const profile = buildProfileMessage(100, {
    ...user,
    _id: 'mongo-secret',
    telegramId: 100,
    regStep: 'church',
  } as typeof user, [])

  assert.doesNotMatch(profile.text, /mongo-secret|telegramId|regStep|\b100\b/)
})

test('owned team limits volunteers to five and renders the remainder', () => {
  const volunteers = Array.from({ length: 13 }, (_, index) =>
    member(index + 101, `Волонтёр ${index + 1}`)
  )
  const profile = buildProfileMessage(100, user, [
    {
      name: 'Команда',
      ownerId: 100,
      members: [{ telegramId: 100, role: 'owner', status: 'active' }, ...volunteers],
    },
  ])

  assert.match(profile.text, /Волонтёр 5/)
  assert.doesNotMatch(profile.text, /Волонтёр 6/)
  assert.match(profile.text, /\+ ещё 8/)
})

test('profile text uses all centralized custom emoji ids', () => {
  const profile = buildProfileMessage(100, user, [])
  const ids = profile.entities
    .filter((entity) => entity.type === 'custom_emoji')
    .map((entity) => entity.custom_emoji_id)

  assert.deepEqual(ids, [
    PROFILE_ICONS.profile,
    PROFILE_ICONS.city,
    PROFILE_ICONS.church,
    PROFILE_ICONS.teams,
  ])
})

test('teams heading uses its custom emoji and empty state has no concrete team icon', () => {
  const profile = buildProfileMessage(100, user, [])
  const customEmojiIds = profile.entities
    .filter((entity) => entity.type === 'custom_emoji')
    .map((entity) => entity.custom_emoji_id)

  assert.match(profile.text, /МОИ КОМАНДЫ/)
  assert.ok(customEmojiIds.includes(PROFILE_ICONS.teams))
  assert.ok(!customEmojiIds.includes(PROFILE_ICONS.team))
})

test('each team name uses the team custom emoji', () => {
  const profile = buildProfileMessage(100, user, [
    { name: 'Спасение', ownerId: 100 },
    { name: 'Свет миру', ownerId: 200, members: [member(100, user.fio)] },
  ])
  const teamIcons = profile.entities.filter(
    (entity) =>
      entity.type === 'custom_emoji' && entity.custom_emoji_id === PROFILE_ICONS.team
  )

  assert.equal(teamIcons.length, 2)
})

test('only an owned team name contains the crown marker', () => {
  const ownerProfile = buildProfileMessage(100, user, [
    { name: 'Спасение', ownerId: 100 },
  ])
  const memberProfile = buildProfileMessage(100, user, [
    { name: 'Свет миру', ownerId: 200, members: [member(100, user.fio)] },
  ])

  assert.match(ownerProfile.text, /Спасение 👑/)
  assert.doesNotMatch(memberProfile.text, /Свет миру 👑/)
  assert.doesNotMatch(memberProfile.text, /👑/)
})

test('main menu profile button has a custom icon without a unicode emoji in its text', () => {
  const button = mainScreen(100).keyboard.inline_keyboard.flat().find((item) => 'text' in item && item.text === 'Мой профиль')

  assert.ok(button && 'callback_data' in button)
  assert.equal(button.icon_custom_emoji_id, PROFILE_ICONS.profile)
  assert.equal(button.callback_data, 'a=open&s=profile')
})

test('profile back button returns through the existing home action', () => {
  const button = buildProfileKeyboard().inline_keyboard[0][0]

  assert.equal(button.text, '← Назад')
  assert.ok('callback_data' in button)
  assert.equal(button.callback_data, 'a=home')
})
