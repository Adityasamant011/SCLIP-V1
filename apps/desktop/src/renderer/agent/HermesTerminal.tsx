import { useEffect, useRef, useState } from 'react'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { WebLinksAddon } from '@xterm/addon-web-links'
import { sclipOpenTerminal, sclipTerminalInput, sclipTerminalResize } from '../ipc/sclip'
import '@xterm/xterm/css/xterm.css'

interface Props {
  projectId: string
  sessionId: string
  onTerminalReady?: (actions: { clear: () => void }) => void
}

/** The real PTY surface. Its process is Hermes-only; it is not a system shell. */
export function HermesTerminal({ projectId, sessionId, onTerminalReady }: Props) {
  const host = useRef<HTMLDivElement>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const node = host.current
    if (!node) return undefined
    let active = true
    const terminal = new Terminal({
      cursorBlink: true,
      convertEol: true,
      scrollback: 8_000,
      fontSize: 12,
      fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
      theme: { background: '#0b0d12', foreground: '#e5e7eb', cursor: '#a5b4fc', selectionBackground: 'rgba(129, 140, 248, .35)' },
    })
    const fit = new FitAddon()
    terminal.loadAddon(fit)
    terminal.loadAddon(new WebLinksAddon())
    terminal.open(node)
    fit.fit()
    onTerminalReady?.({ clear: () => terminal.clear() })

    const writeOutput = (payload: unknown) => {
      const event = payload as { projectId?: unknown; sessionId?: unknown; data?: unknown }
      if (event.projectId === projectId && event.sessionId === sessionId && typeof event.data === 'string') terminal.write(event.data)
    }
    const unsubscribe = window.api.on('sclip:terminal_output', writeOutput)
    const disposable = terminal.onData(data => {
      void sclipTerminalInput(projectId, sessionId, data).catch(problem => {
        if (active) setError(problem instanceof Error ? problem.message : String(problem))
      })
    })
    let lastCols = terminal.cols
    let lastRows = terminal.rows

    const resize = () => {
      if (!active) return
      try {
        fit.fit()
        if (terminal.cols !== lastCols || terminal.rows !== lastRows) {
          lastCols = terminal.cols
          lastRows = terminal.rows
          void sclipTerminalResize(projectId, sessionId, terminal.cols, terminal.rows).catch(() => {})
        }
      } catch {
        // ignore layout transition errors
      }
    }

    const observer = new ResizeObserver(resize)
    observer.observe(node)

    requestAnimationFrame(() => resize())
    void document.fonts?.ready?.then(() => resize())

    void sclipOpenTerminal(projectId, sessionId, terminal.cols, terminal.rows).then(history => {
      if (active && history) {
        terminal.write(history, () => {
          terminal.scrollToBottom()
        })
      }
    }).catch(problem => {
      if (active) setError(problem instanceof Error ? problem.message : String(problem))
    })
    return () => {
      active = false
      observer.disconnect()
      disposable.dispose()
      unsubscribe()
      terminal.dispose()
    }
  }, [projectId, sessionId])

  return <div className="sclip-live-terminal" aria-label="Hermes interactive terminal">
    {error && <div className="sclip-terminal-error" role="alert">{error}</div>}
    <div ref={host} className="sclip-terminal-host" />
  </div>
}
