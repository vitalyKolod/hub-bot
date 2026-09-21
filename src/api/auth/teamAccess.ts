export function isTeamMember(team: { members?: Array<{ telegramId: number }> }, telegramId: number) {
  return Boolean(team.members?.some((member) => member.telegramId === telegramId))
}
