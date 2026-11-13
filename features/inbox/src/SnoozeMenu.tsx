import { useEffect } from 'react'
import { actions } from '@omni-desk/client'
import type { Message } from '@omni-desk/contracts'
import { formatUntil, snoozeOptions } from './snooze'

/**
 * 「あとで」の時刻を選ぶ欄。数字キー 1〜4 でも選べる。
 * 一覧は角丸のため overflow-hidden で、浮かせるメニューだと切れてしまうので、行の中に展開して表示する。
 */
export function SnoozeMenu({ message, now }: { message: Message; now: number }) {
  const options = snoozeOptions(now)

  const choose = (until: number, label: string): void => {
    actions.setUi({ inboxSnoozeFor: null })
    void actions.setInboxStatus([message], 'snoozed', until, `${label}（${formatUntil(until, now)}）まで隠しました`)
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        e.preventDefault()
        e.stopPropagation()
        actions.setUi({ inboxSnoozeFor: null })
        return
      }
      const index = Number(e.key) - 1
      if (index >= 0 && index < options.length) {
        e.preventDefault()
        e.stopPropagation()
        choose(options[index].until, options[index].label)
      }
    }
    // 受信箱全体のショートカットより先に処理する
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  })

  return (
    <div className="animate-fade-in mt-2.5 rounded-lg border border-line bg-sunken p-2">
      <p className="px-1 pb-1.5 text-[11px] font-semibold text-fg-subtle">あとで（この時刻まで隠す）— 1〜4 キーでも選べます。Esc で閉じる</p>
      <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-4">
        {options.map((o, i) => (
          <button
            key={o.key}
            onClick={() => choose(o.until, o.label)}
            className="flex items-center gap-2 rounded-md border border-line bg-panel px-2.5 py-1.5 text-left text-[12.5px] transition-colors hover:border-accent hover:bg-accent-soft"
          >
            <kbd className="w-4 rounded border border-line bg-sunken text-center text-[10px] text-fg-subtle">{i + 1}</kbd>
            <span className="min-w-0 flex-1">
              <span className="block truncate font-medium">{o.label}</span>
              <span className="block truncate text-[11px] text-fg-subtle">{formatUntil(o.until, now)}</span>
            </span>
          </button>
        ))}
      </div>
    </div>
  )
}
