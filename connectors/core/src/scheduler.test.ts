import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { chatworkRateGovernor, PRIORITY, RateGovernor, Scheduler } from './scheduler'

describe('RateGovernor', () => {
  let now = 0
  const clock = () => now

  beforeEach(() => {
    now = 1_000_000
  })

  it('余裕があれば全優先度を即時実行し、使うほど低優先度から止まる', () => {
    const g = chatworkRateGovernor(clock)
    expect(g.waitTime(PRIORITY.backfill)).toBe(0)
    for (let i = 0; i < 180; i++) g.record()
    expect(g.waitTime(PRIORITY.backfill)).toBeGreaterThan(0) // 追いつき取得は 180 回まで
    expect(g.waitTime(PRIORITY.mention)).toBe(0)
    for (let i = 0; i < 105; i++) g.record()
    expect(g.waitTime(PRIORITY.mention)).toBeGreaterThan(0) // 閲覧・自分宛ては 285 回まで
    expect(g.waitTime(PRIORITY.write)).toBe(0) // 送信は最後まで残す
  })

  it('ヘッダーの残り回数が少なければアプリ内の計測より優先する', () => {
    const g = chatworkRateGovernor(clock)
    g.updateFromHeaders({ limit: 300, remaining: 20, resetAt: now + 60_000 })
    expect(g.waitTime(PRIORITY.poll)).toBeGreaterThan(0) // 残り 30 以下ではポーリングしない
    expect(g.waitTime(PRIORITY.view)).toBe(0)
    expect(g.status(0).remaining).toBe(20)
  })

  it('429 を受けたら解除時刻まですべて止める', () => {
    const g = chatworkRateGovernor(clock)
    g.block(now + 30_000)
    expect(g.waitTime(PRIORITY.write)).toBe(30_000)
    now += 30_001
    expect(g.waitTime(PRIORITY.write)).toBe(0)
  })

  it('時間枠を過ぎた分は回復する', () => {
    const g = new RateGovernor({
      windowMs: 60_000,
      limit: 2,
      now: clock,
      rules: {
        0: { minRemaining: 0, maxUsed: 2 },
        1: { minRemaining: 0, maxUsed: 2 },
        2: { minRemaining: 0, maxUsed: 2 },
        3: { minRemaining: 0, maxUsed: 2 },
        4: { minRemaining: 0, maxUsed: 2 },
        5: { minRemaining: 0, maxUsed: 2 },
        6: { minRemaining: 0, maxUsed: 2 }
      }
    })
    g.record()
    g.record()
    expect(g.waitTime(PRIORITY.write)).toBe(60_000)
    now += 60_001
    expect(g.waitTime(PRIORITY.write)).toBe(0)
  })
})

describe('Scheduler', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('優先度の高い順に実行し、同じキーは 1 回にまとめる', async () => {
    const g = chatworkRateGovernor()
    const s = new Scheduler(g, { concurrency: 1 })
    const order: string[] = []
    const job = (name: string) => async () => {
      order.push(name)
    }
    // 1 件目は即座に走るので、残りの並び順を確認する
    const first = s.enqueue('first', PRIORITY.poll, job('first'))
    const a = s.enqueue('room:1', PRIORITY.backfill, job('room1-backfill'))
    const b = s.enqueue('room:2', PRIORITY.mention, job('room2'))
    const c = s.enqueue('room:1', PRIORITY.view, job('room1-view')) // 既存の room:1 に合流し、優先度だけ上がる
    await Promise.all([first, a, b, c])
    expect(order).toEqual(['first', 'room1-backfill', 'room2'])
  })

  it('低優先度が予算待ちでも、高優先度のジョブはすぐ実行する', async () => {
    const g = chatworkRateGovernor()
    for (let i = 0; i < 160; i++) g.record() // scan（150 回まで）だけが止まる状態
    const s = new Scheduler(g, { concurrency: 1 })
    let scanned = false
    let written = false
    s.enqueue('scan:1', PRIORITY.scan, async () => {
      scanned = true
    }).catch(() => {}) // dispose で破棄される
    await s.enqueue('send:1', PRIORITY.write, async () => {
      written = true
    })
    expect(written).toBe(true)
    expect(scanned).toBe(false)
    s.dispose()
  })

  it('枠が空くまで待ってから実行する', async () => {
    let now = 0
    const g = chatworkRateGovernor(() => now)
    g.block(10_000)
    const s = new Scheduler(g, { concurrency: 1 })
    let done = false
    const p = s.enqueue('x', PRIORITY.write, async () => {
      done = true
    })
    await vi.advanceTimersByTimeAsync(5_000)
    expect(done).toBe(false)
    now = 10_001
    await vi.advanceTimersByTimeAsync(5_000)
    await p
    expect(done).toBe(true)
  })
})
