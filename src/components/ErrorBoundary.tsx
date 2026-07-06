/**
 * Last line of defence for the draft: if the render tree crashes, persist
 * the current script immediately and give the writer a way to download it
 * before reloading. A screenwriting app may break; it may not lose pages.
 */
import { Component, type ReactNode } from 'react'
import { useScriptStore } from '../stores/scriptStore'
import { putScript } from '../storage/local'

interface State {
  error: Error | null
}

export class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(): void {
    // Best-effort persistence of the in-memory draft, both stores.
    try {
      const script = useScriptStore.getState().script
      void putScript(script).catch(() => {})
      localStorage.setItem('writersdraft:crash-backup', JSON.stringify(script))
    } catch {
      // Persistence itself failed — the download button below still works.
    }
  }

  private download = () => {
    try {
      const script = useScriptStore.getState().script
      const a = document.createElement('a')
      a.href = URL.createObjectURL(
        new Blob([JSON.stringify(script, null, 2)], { type: 'application/json' }),
      )
      a.download = `${script.titlePage.title || 'script'}-backup.json`
      a.click()
      URL.revokeObjectURL(a.href)
    } catch {
      // ignore
    }
  }

  render() {
    if (!this.state.error) return this.props.children
    return (
      <div className="flex h-screen flex-col items-center justify-center gap-4 bg-gray-100 p-8 text-center">
        <h1 className="text-xl font-semibold text-gray-800">Something went wrong</h1>
        <p className="max-w-md text-sm text-gray-600">
          The editor hit an unexpected error. Your script was saved locally the moment this
          happened. You can download a backup copy now, then reload to continue writing.
        </p>
        <div className="flex gap-3">
          <button
            onClick={this.download}
            className="rounded border border-gray-300 bg-white px-3 py-1.5 text-sm hover:border-blue-400"
          >
            Download backup
          </button>
          <button
            onClick={() => location.reload()}
            className="rounded bg-blue-500 px-3 py-1.5 text-sm text-white hover:bg-blue-600"
          >
            Reload
          </button>
        </div>
        <pre className="mt-4 max-w-lg overflow-auto rounded bg-gray-200 p-2 text-left text-[10px] text-gray-500">
          {String(this.state.error)}
        </pre>
      </div>
    )
  }
}
