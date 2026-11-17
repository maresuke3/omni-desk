import { CircleDot, ExternalLink, GitPullRequest } from 'lucide-react'
import { openExternal } from '@omni-desk/client'
import type { GitHubIssue, PullRequest } from '@omni-desk/contracts'
import { formatMessageTime } from '@omni-desk/message-kit'
import { Box, Card, Chip, Divider, EmptyState, ListItemButton, Stack, Typography } from '@omni-desk/ui'

export function PullRequestsSection({ items }: { items: PullRequest[] }) {
  return (
    <Box>
      <Stack direction="row" spacing={1} sx={{ mb: 1, alignItems: 'center', px: 0.5 }}>
        <GitPullRequest size={16} />
        <Typography variant="body2" sx={{ fontWeight: 600 }}>
          GitHub Pull Requests
        </Typography>
        <Typography variant="caption" color="text.disabled" sx={{ fontVariantNumeric: 'tabular-nums' }}>
          {items.length}
        </Typography>
      </Stack>
      {items.length === 0 ? (
        <Card sx={{ p: 3 }}>
          <EmptyState icon={<GitPullRequest size={24} />} title="対象の Pull Request はありません" />
        </Card>
      ) : (
        <Card sx={{ overflow: 'hidden' }}>
          <Stack divider={<Divider />}>
            {items.map((pr) => (
              <ListItemButton key={pr.id} onClick={() => openExternal(pr.url)} sx={{ alignItems: 'flex-start', gap: 2, px: 2, py: 2 }}>
                <Box sx={{ minWidth: 0, flex: 1 }}>
                  <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap', alignItems: 'center' }}>
                    <Chip
                      size="small"
                      color={pr.role === 'reviewer' ? 'warning' : 'primary'}
                      variant="outlined"
                      label={pr.role === 'reviewer' ? 'レビュー依頼' : '自分の PR'}
                    />
                    {pr.isDraft && <Chip size="small" label="Draft" />}
                    <Typography variant="caption" color="text.disabled">
                      {pr.repo} #{pr.number}
                    </Typography>
                  </Stack>
                  <Typography variant="body1" sx={{ mt: 0.5, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {pr.title}
                  </Typography>
                  <Typography variant="caption" color="text.disabled" sx={{ display: 'block', mt: 0.5 }}>
                    {pr.author.name} · {formatMessageTime(pr.updatedAt)}
                  </Typography>
                </Box>
                <ExternalLink size={16} />
              </ListItemButton>
            ))}
          </Stack>
        </Card>
      )}
    </Box>
  )
}

export function GitHubIssuesSection({ items }: { items: GitHubIssue[] }) {
  return (
    <Box>
      <Stack direction="row" spacing={1} sx={{ mb: 1, alignItems: 'center', px: 0.5 }}>
        <CircleDot size={16} />
        <Typography variant="body2" sx={{ fontWeight: 600 }}>
          GitHub Issues（アサイン済み）
        </Typography>
        <Typography variant="caption" color="text.disabled" sx={{ fontVariantNumeric: 'tabular-nums' }}>
          {items.length}
        </Typography>
      </Stack>
      {items.length === 0 ? (
        <Card sx={{ p: 3 }}>
          <EmptyState icon={<CircleDot size={24} />} title="アサインされた Issue はありません" />
        </Card>
      ) : (
        <Card sx={{ overflow: 'hidden' }}>
          <Stack divider={<Divider />}>
            {items.map((issue) => (
              <ListItemButton key={issue.id} onClick={() => openExternal(issue.url)} sx={{ alignItems: 'flex-start', gap: 2, px: 2, py: 2 }}>
                <Box sx={{ minWidth: 0, flex: 1 }}>
                  <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap', alignItems: 'center' }}>
                    <Typography variant="caption" color="text.disabled">
                      {issue.repo} #{issue.number}
                    </Typography>
                    {issue.labels?.slice(0, 3).map((label) => (
                      <Chip key={label} size="small" label={label} />
                    ))}
                  </Stack>
                  <Typography variant="body1" sx={{ mt: 0.5, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {issue.title}
                  </Typography>
                  <Typography variant="caption" color="text.disabled" sx={{ display: 'block', mt: 0.5 }}>
                    {issue.author.name} · {formatMessageTime(issue.updatedAt)}
                  </Typography>
                </Box>
                <ExternalLink size={16} />
              </ListItemButton>
            ))}
          </Stack>
        </Card>
      )}
    </Box>
  )
}
