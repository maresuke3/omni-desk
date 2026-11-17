import { useState } from 'react'
import { ArrowUpRight, CalendarClock, Circle, CircleCheck } from 'lucide-react'
import type { Task } from '@omni-desk/contracts'
import { openExternal } from '@omni-desk/client'
import { Avatar, Box, Chip, IconButton, SourceMark, Stack, Tooltip, Typography } from '@omni-desk/ui'
import { dueInfo } from './time'
import { RichText } from './RichText'

export function DueChip({ task }: { task: Task }) {
  const due = dueInfo(task)
  if (task.status === 'done') {
    return <Chip size="small" color="success" variant="outlined" label="完了" sx={{ fontSize: '12px' }} />
  }
  const color = due.tone === 'danger' ? 'error' : due.tone === 'warning' ? 'warning' : due.tone === 'accent' ? 'primary' : 'default'
  return <Chip size="small" color={color} variant="outlined" icon={<CalendarClock size={12} />} label={due.label} sx={{ fontSize: '12px' }} />
}

/**
 * タスク 1 行。今回は表示のみ（完了操作は各サービス側で行う）。
 */
export function TaskRow({ task, dense }: { task: Task; dense?: boolean }) {
  const [expanded, setExpanded] = useState(false)
  const done = task.status === 'done'
  return (
    <Stack
      direction="row"
      spacing={2}
      sx={(theme) => ({
        px: 2,
        py: dense ? 1 : 2,
        transition: 'background-color 120ms',
        '&:hover': { bgcolor: theme.palette.action.hover },
        '&:hover .task-open-btn': { opacity: 1 }
      })}
    >
      <Tooltip title={done ? '完了' : '未完了'}>
        <Box component="span" sx={{ mt: 0.5, flexShrink: 0, color: done ? 'success.main' : 'divider' }}>
          {done ? <CircleCheck size={16} /> : <Circle size={16} />}
        </Box>
      </Tooltip>
      <Box sx={{ minWidth: 0, flex: 1 }}>
        <Box
          component="button"
          type="button"
          onClick={() => setExpanded((v) => !v)}
          sx={{
            display: 'block',
            width: '100%',
            textAlign: 'left',
            border: 0,
            background: 'transparent',
            p: 0,
            cursor: 'pointer',
            color: done ? 'text.disabled' : 'text.primary',
            textDecoration: done ? 'line-through' : 'none',
            ...(expanded
              ? {}
              : {
                  overflow: 'hidden',
                  display: '-webkit-box',
                  WebkitLineClamp: 3,
                  WebkitBoxOrient: 'vertical'
                })
          }}
        >
          <RichText text={task.text} format={task.format} />
        </Box>
        <Stack direction="row" spacing={2} sx={{ mt: 1, flexWrap: 'wrap', alignItems: 'center', rowGap: 1 }}>
          <DueChip task={task} />
          <Stack direction="row" spacing={1} sx={{ minWidth: 0, alignItems: 'center' }}>
            <SourceMark source={task.source} size="xs" />
            {task.conversationName && (
              <Typography
                variant="caption"
                color="text.secondary"
                sx={{ maxWidth: 224, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
              >
                {task.conversationName}
              </Typography>
            )}
          </Stack>
          {task.assignedBy && !dense && (
            <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
              <Avatar name={task.assignedBy.name} url={task.assignedBy.avatarUrl} size={16} />
              <Typography
                variant="caption"
                color="text.secondary"
                sx={{ maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
              >
                {task.assignedBy.name}
                <Box component="span" sx={{ color: 'text.disabled' }}>
                  {task.source === 'chatwork' ? ' から依頼' : ' の投稿'}
                </Box>
              </Typography>
            </Stack>
          )}
        </Stack>
      </Box>
      {task.permalink && (
        <Box className="task-open-btn" sx={{ opacity: 0, transition: 'opacity 120ms' }}>
          <IconButton
            label={task.source === 'slack' ? 'Slack で開く' : 'Chatwork で開く'}
            onClick={() => openExternal(task.permalink)}
          >
            <ArrowUpRight size={16} />
          </IconButton>
        </Box>
      )}
    </Stack>
  )
}
