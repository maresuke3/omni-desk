import { Component, type ErrorInfo, type ReactNode } from 'react'
import { TriangleAlert } from 'lucide-react'
import { Button } from '@omni-desk/ui'

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
      <div className="flex h-full flex-col items-center justify-center gap-3 p-10 text-center">
        <span className="flex size-11 items-center justify-center rounded-xl bg-danger-soft text-danger">
          <TriangleAlert className="size-5" />
        </span>
        <div>
          <p className="font-medium">この画面でエラーが発生しました</p>
          <p className="mt-1 max-w-md text-[12.5px] text-fg-muted">{this.state.error.message}</p>
        </div>
        <Button onClick={() => this.setState({ error: null })}>再読み込み</Button>
      </div>
    )
  }
}
