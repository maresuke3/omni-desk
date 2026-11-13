import { useState } from 'react'
import { ArrowUpRight, CalendarClock, Circle, CircleCheck } from 'lucide-react'
import type { Task } from '@omni-desk/contracts'
import { openExternal } from '@omni-desk/client'
import { cn } from '@omni-desk/ui'
import { dueInfo } from './time'
import { RichText } from './RichText'
import { Avatar, IconButton, SourceMark } from '@omni-desk/ui'

const TONE: Record<ReturnType<typeof dueInfo>['tone'], string> = {
  danger: 'bg-danger-soft text-danger',
  warning: 'bg-warning-soft text-warning',
  accent: 'bg-accent-soft text-accent-text',
  muted: 'bg-sunken text-fg-muted'
}

export function DueChip({ task }: { task: Task }) {
  const due = dueInfo(task)
  if (task.status === 'done') {
    return (
      <span className="inline-flex items-center gap-1 rounded-md bg-success-soft px-1.5 py-0.5 text-[11.5px] font-medium text-success">
        完了
      </span>
    )
  }
  return (
    <span className={cn('inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11.5px] font-medium', TONE[due.tone])}>
      <CalendarClock className="size-3" />
      {due.label}
    </span>
  )
}

/**
 * タスク 1 行。今回は表示のみ（完了操作は各サービス側で行う）。
 */
export function TaskRow({ task, dense }: { task: Task; dense?: boolean }) {
  const [expanded, setExpanded] = useState(false)
  const done = task.status === 'done'
  return (
    <div className={cn('group flex gap-3 px-4 transition-colors hover:bg-hover/60', dense ? 'py-2.5' : 'py-3')}>
      <span className="mt-0.5 shrink-0" title={done ? '完了' : '未完了'}>
        {done ? <CircleCheck className="size-[18px] text-success" /> : <Circle className="size-[18px] text-line-strong" />}
      </span>
      <div className="min-w-0 flex-1">
        <button
          onClick={() => setExpanded((v) => !v)}
          className={cn('block w-full text-left', !expanded && 'line-clamp-3', done && 'text-fg-subtle line-through decoration-fg-subtle/40')}
        >
          <RichText text={task.text} format={task.format} className="pointer-events-none leading-relaxed" />
        </button>
        <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-fg-muted">
          <DueChip task={task} />
          <span className="inline-flex min-w-0 items-center gap-1.5">
            <SourceMark source={task.source} size="xs" />
            {task.conversationName && <span className="max-w-[220px] truncate">{task.conversationName}</span>}
          </span>
          {task.assignedBy && !dense && (
            <span className="inline-flex items-center gap-1.5">
              <Avatar name={task.assignedBy.name} url={task.assignedBy.avatarUrl} size={16} />
              <span className="max-w-[160px] truncate">
                {task.assignedBy.name}
                <span className="text-fg-subtle">{task.source === 'chatwork' ? ' から依頼' : ' の投稿'}</span>
              </span>
            </span>
          )}
        </div>
      </div>
      {task.permalink && (
        <IconButton
          label={task.source === 'slack' ? 'Slack で開く' : 'Chatwork で開く'}
          onClick={() => openExternal(task.permalink)}
          className="opacity-0 group-hover:opacity-100"
        >
          <ArrowUpRight className="size-4" />
        </IconButton>
      )}
    </div>
  )
}
