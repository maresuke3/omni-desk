import type { RateStatus } from '@omni-desk/contracts'

/**
 * API 呼び出しの優先度（小さいほど優先）。
 * 送信など利用者の操作に直結するものを最優先にし、起動時の追いつき取得は余裕があるときだけ行う。
 */
export const PRIORITY = {
  /** メッセージ送信・タスク操作などの書き込み */
  write: 0,
  /** 利用者が開いている会話の取得 */
  view: 1,
  /** 自分宛ての未読が増えたルームの取得 */
  mention: 2,
  /** 変更検知（ルーム一覧） */
  poll: 3,
  /** タスク一覧の更新 */
  tasks: 4,
  /** 起動時・スリープ復帰時の追いつき取得 */
  backfill: 5,
  /** 自分宛ての未読数が増えなかった変化ルームの確認（読まれて未読数が戻った自分宛てを拾う）。最も控えめ */
  scan: 6
} as const

export type Priority = (typeof PRIORITY)[keyof typeof PRIORITY]

export interface PriorityRule {
  /** 残り回数がこれ以下なら実行しない（上位の優先度のために枠を残す） */
  minRemaining: number
  /** 時間枠内でこの回数を使っていたら実行しない */
  maxUsed: number
}

export interface RateGovernorOptions {
  /** 時間枠（Chatwork は 5 分） */
  windowMs: number
  /** 時間枠あたりの上限（Chatwork は 300 回） */
  limit: number
  rules: Record<Priority, PriorityRule>
  now?: () => number
}

/** API クライアントがレート情報を報告するための窓口 */
export interface RateObserver {
  /** リクエストを 1 回送った */
  record(): void
  /** レスポンスヘッダーのレート情報（x-ratelimit-*） */
  updateFromHeaders(info: { limit?: number; remaining?: number; resetAt?: number }): void
  /** 429 を受けた。解除時刻まで止める */
  block(untilMs: number): void
}

/**
 * レート制限の予算管理。アプリ内で数えた回数とサーバーのヘッダーの両方を見て、
 * 優先度ごとに「今実行してよいか」「あと何 ms 待つか」を判断する。
 */
export class RateGovernor implements RateObserver {
  private readonly sent: number[] = []
  private header: { limit: number; remaining: number; resetAt: number } | null = null
  private blockedUntil = 0
  private readonly now: () => number

  constructor(private readonly options: RateGovernorOptions) {
    this.now = options.now ?? Date.now
  }

  record(): void {
    this.sent.push(this.now())
    if (this.header && this.header.resetAt > this.now()) {
      this.header = { ...this.header, remaining: Math.max(0, this.header.remaining - 1) }
    }
  }

  updateFromHeaders(info: { limit?: number; remaining?: number; resetAt?: number }): void {
    if (info.remaining === undefined || info.resetAt === undefined) return
    this.header = {
      limit: info.limit ?? this.options.limit,
      remaining: info.remaining,
      resetAt: info.resetAt
    }
  }

  block(untilMs: number): void {
    this.blockedUntil = Math.max(this.blockedUntil, untilMs)
  }

  private prune(): void {
    const from = this.now() - this.options.windowMs
    while (this.sent.length && this.sent[0] <= from) this.sent.shift()
  }

  private get used(): number {
    this.prune()
    return this.sent.length
  }

  private get remaining(): number {
    const local = this.options.limit - this.used
    const now = this.now()
    if (this.header && this.header.resetAt > now) return Math.min(local, this.header.remaining)
    return local
  }

  /** 指定の優先度のジョブを実行できるまでの待ち時間（0 なら今すぐ実行できる） */
  waitTime(priority: Priority): number {
    const now = this.now()
    if (this.blockedUntil > now) return this.blockedUntil - now
    const rule = this.options.rules[priority]
    if (this.remaining > rule.minRemaining && this.used < rule.maxUsed) return 0
    // 枠が回復する一番早い時刻まで待つ
    const candidates: number[] = []
    if (this.sent.length) candidates.push(this.sent[0] + this.options.windowMs - now)
    if (this.header && this.header.resetAt > now) candidates.push(this.header.resetAt - now)
    const wait = candidates.length ? Math.min(...candidates) : this.options.windowMs
    return Math.max(1_000, wait)
  }

  status(queued: number): RateStatus {
    const now = this.now()
    return {
      limit: this.header?.limit ?? this.options.limit,
      remaining: Math.max(0, this.remaining),
      resetAt: this.header && this.header.resetAt > now ? this.header.resetAt : this.sent.length ? this.sent[0] + this.options.windowMs : null,
      blockedUntil: this.blockedUntil > now ? this.blockedUntil : null,
      queued
    }
  }
}

/** Chatwork（5 分 300 回）向けの既定値。書き込みと閲覧のために枠を残し、追いつき取得は控えめにする */
export function chatworkRateGovernor(now?: () => number): RateGovernor {
  return new RateGovernor({
    windowMs: 5 * 60_000,
    limit: 300,
    now,
    rules: {
      [PRIORITY.write]: { minRemaining: 0, maxUsed: 300 },
      [PRIORITY.view]: { minRemaining: 15, maxUsed: 285 },
      [PRIORITY.mention]: { minRemaining: 15, maxUsed: 285 },
      [PRIORITY.poll]: { minRemaining: 30, maxUsed: 270 },
      [PRIORITY.tasks]: { minRemaining: 40, maxUsed: 240 },
      [PRIORITY.backfill]: { minRemaining: 80, maxUsed: 180 },
      // 他の連携（同じアカウントの Bot など）と枠を共有していても 100 回は残す
      [PRIORITY.scan]: { minRemaining: 100, maxUsed: 150 }
    }
  })
}

interface QueuedJob {
  key: string
  priority: Priority
  seq: number
  run: () => Promise<unknown>
  resolve: (value: unknown) => void
  reject: (error: unknown) => void
}

/**
 * 優先度付きの実行キュー。
 * - 同じキーのジョブは 1 つにまとめる（何度変化しても取得は 1 回）。優先度は高い方に上げる
 * - RateGovernor が許すまで待ってから実行する
 */
export class Scheduler {
  private readonly queue = new Map<string, QueuedJob>()
  private running = 0
  private seq = 0
  private timer: ReturnType<typeof setTimeout> | null = null
  private disposed = false

  constructor(
    private readonly governor: RateGovernor,
    private readonly options: { concurrency?: number; onIdle?: () => void } = {}
  ) {}

  get size(): number {
    return this.queue.size + this.running
  }

  has(key: string): boolean {
    return this.queue.has(key)
  }

  enqueue<T>(key: string, priority: Priority, run: () => Promise<T>): Promise<T> {
    if (this.disposed) return Promise.reject(new Error('scheduler disposed'))
    const existing = this.queue.get(key)
    if (existing) {
      if (priority < existing.priority) existing.priority = priority
      this.pump()
      return new Promise<T>((resolve, reject) => {
        const prevResolve = existing.resolve
        const prevReject = existing.reject
        existing.resolve = (v) => {
          prevResolve(v)
          resolve(v as T)
        }
        existing.reject = (e) => {
          prevReject(e)
          reject(e)
        }
      })
    }
    return new Promise<T>((resolve, reject) => {
      this.queue.set(key, {
        key,
        priority,
        seq: this.seq++,
        run,
        resolve: resolve as (v: unknown) => void,
        reject
      })
      this.pump()
    })
  }

  private next(): QueuedJob | undefined {
    let best: QueuedJob | undefined
    for (const job of this.queue.values()) {
      if (!best || job.priority < best.priority || (job.priority === best.priority && job.seq < best.seq)) {
        best = job
      }
    }
    return best
  }

  private pump(): void {
    if (this.disposed) return
    // 予算待ちのタイマー中でも、新しく積まれた高優先度のジョブはすぐ実行できるか判定し直す
    if (this.timer) {
      clearTimeout(this.timer)
      this.timer = null
    }
    const concurrency = this.options.concurrency ?? 2
    while (this.running < concurrency) {
      const job = this.next()
      if (!job) {
        if (this.running === 0) this.options.onIdle?.()
        return
      }
      const wait = this.governor.waitTime(job.priority)
      if (wait > 0) {
        this.timer = setTimeout(() => {
          this.timer = null
          this.pump()
        }, Math.min(wait, 5_000))
        return
      }
      this.queue.delete(job.key)
      this.running++
      job
        .run()
        .then(job.resolve, job.reject)
        .finally(() => {
          this.running--
          this.pump()
        })
    }
  }

  dispose(): void {
    this.disposed = true
    if (this.timer) clearTimeout(this.timer)
    this.timer = null
    for (const job of this.queue.values()) job.reject(new Error('scheduler disposed'))
    this.queue.clear()
  }
}
