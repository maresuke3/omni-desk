import type { ApiErrorPayload, ErrorCode } from '@omni-desk/contracts'

export class AppError extends Error {
  constructor(
    readonly code: ErrorCode,
    message: string
  ) {
    super(message)
    this.name = 'AppError'
  }
}

export function toErrorPayload(error: unknown): ApiErrorPayload {
  if (error instanceof AppError) return { code: error.code, message: error.message }
  const message = error instanceof Error ? error.message : String(error)
  return { code: 'unknown', message }
}

export const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms))

/** 同時実行数を制限して map する（API のレート制限対策） */
export async function mapWithConcurrency<T, R>(
  items: readonly T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  const results = new Array<R>(items.length)
  let next = 0
  const worker = async (): Promise<void> => {
    while (next < items.length) {
      const index = next++
      results[index] = await fn(items[index], index)
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker))
  return results
}
