export function normalizeYesNo(input: string): 'yes' | 'no' | null {
  const t = input.trim().toLowerCase()
  if (['да', 'д', 'yes', 'y', '+', 'ага'].includes(t)) return 'yes'
  if (['нет', 'н', 'no', 'n', '-', 'неа'].includes(t)) return 'no'
  return null
}
