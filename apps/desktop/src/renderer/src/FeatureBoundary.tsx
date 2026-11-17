import { Component, type ErrorInfo, type ReactNode } from 'react'
import { TriangleAlert } from 'lucide-react'
import { Button, EmptyState } from '@omni-desk/ui'

interface Props {
  featureId: string
  children: ReactNode
}

interface State {
  error: Error | null
}

/**
 * Feature ごとのエラー境界。ある画面が落ちてもサイドバーや他の画面は動き続ける。
 */
export class FeatureBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error(`[feature:${this.props.featureId}]`, error, info.componentStack)
  }

  componentDidUpdate(prev: Props): void {
    if (prev.featureId !== this.props.featureId && this.state.error) this.setState({ error: null })
  }

  render(): ReactNode {
    if (!this.state.error) return this.props.children
    return (
      <EmptyState
        icon={<TriangleAlert size={24} />}
        title="この画面でエラーが発生しました"
        description={this.state.error.message}
        action={<Button onClick={() => this.setState({ error: null })}>再読み込み</Button>}
      />
    )
  }
}
