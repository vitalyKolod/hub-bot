export function computeDaysLeft(input: string) {
  const parts = input.split('.')
  if (parts.length !== 3) return null

  const [day, month, year] = parts.map(Number)

  const date = new Date(year, month - 1, day)

  if (isNaN(date.getTime())) return null

  const now = new Date()

  const diff = Math.ceil((date.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))

  return { date, daysLeft: diff }
}
