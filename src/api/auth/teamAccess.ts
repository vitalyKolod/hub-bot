export function isTeamMember(team: { ownerId?: number; members?: Array<{ telegramId: number; status?: string }> }, telegramId: number) {
  return team.ownerId === telegramId || Boolean(team.members?.some((member) => member.telegramId === telegramId && (!member.status || member.status === 'active')))
}
