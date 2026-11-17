import { useEffect } from 'react'
import { actions } from '@omni-desk/client'
import type { Message } from '@omni-desk/contracts'
import { Box, Chip, ListItemButton, Paper, Typography } from '@omni-desk/ui'
import { formatUntil, snoozeOptions } from './snooze'

/**
 * 「あとで」の時刻を選ぶ欄。数字キー 1〜4 でも選べる。
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
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  })

  return (
    <Paper
      variant="outlined"
      sx={(theme) => ({
        mt: 2,
        p: 1,
        bgcolor: theme.palette.mode === 'dark' ? '#12151a' : '#f6f7f9'
      })}
    >
      <Typography variant="caption" color="text.disabled" sx={{ display: 'block', px: 1, pb: 1, fontWeight: 600 }}>
        あとで（この時刻まで隠す）— 1〜4 キーでも選べます。Esc で閉じる
      </Typography>
      <Box sx={{ display: 'grid', gap: 1, gridTemplateColumns: { xs: 'repeat(2, 1fr)', sm: 'repeat(4, 1fr)' } }}>
        {options.map((o, i) => (
          <ListItemButton
            key={o.key}
            onClick={() => choose(o.until, o.label)}
            sx={(theme) => ({
              borderRadius: 1,
              border: `1px solid ${theme.palette.divider}`,
              bgcolor: theme.palette.background.paper,
              gap: 1,
              px: 1.5,
              py: 1
            })}
          >
            <Chip size="small" variant="outlined" label={i + 1} />
            <Box sx={{ minWidth: 0, flex: 1 }}>
              <Typography variant="body2" sx={{ fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {o.label}
              </Typography>
              <Typography variant="caption" color="text.disabled" sx={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {formatUntil(o.until, now)}
              </Typography>
            </Box>
          </ListItemButton>
        ))}
      </Box>
    </Paper>
  )
}
