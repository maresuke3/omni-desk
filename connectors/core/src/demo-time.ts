/** デモデータ用の時刻ヘルパー。「今」からの相対で作るのでいつ起動しても自然に見える */
export const MIN = 60_000
export const HOUR = 60 * MIN
export const DAY = 24 * HOUR

export const ago = (ms: number): number => Date.now() - ms
export const startOfToday = (): number => {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  return d.getTime()
}
export const todayAt = (h: number, m = 0): number => startOfToday() + h * HOUR + m * MIN
export const daysFromNow = (days: number, h = 18): number => startOfToday() + days * DAY + h * HOUR
