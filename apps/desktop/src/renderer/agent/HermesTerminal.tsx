import { useEffect, useRef, useState } from 'react'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { WebLinksAddon } from '@xterm/addon-web-links'
import { suppressHistoricalQueries } from './terminalReplay'
import { sclipOpenTerminal, sclipTerminalInput, sclipTerminalResize, type SclipTerminalSnapshot } from '../ipc/sclip'
import '@xterm/xterm/css/xterm.css'

interface Props {
  projectId: string
  sessionId: string
  onTerminalReady?: (actions: { clear: () => void }) => void
}

function transformTerminalOutput(data: string): string {
  if (!data) return data
  let text = data
  text = text.replace(/⚕\s*NOUS HERMES\s*-\s*AI Agent Framework/g, '✦ SCLIP - Video Editor Agent')
  text = text.replace(/NOUS HERMES - AI Agent Framework/g, 'SCLIP - Video Editor Framework')
  text = text.replace(/NOUS HERMES/g, 'SCLIP')
  text = text.replace(/Hermes Agent/g, 'Sclip Agent')
  text = text.replace(/Welcome to Hermes Agent!/g, 'Welcome to Sclip Agent!')
  text = text.replace(/Welcome to Hermes!/g, 'Welcome to Sclip!')
  text = text.replace(/Activated skills:\s*weftcut/g, 'Activated skills: sclip-editor')
  text = text.replace(/A legacy OpenClaw directory was[\s\S]*?This tip only shows once\.[ \t]*\r?\n?/g, '')
  text = text.replace(/hermes claw migrate/g, 'sclip claw migrate')
  text = text.replace(/hermes claw cleanup/g, 'sclip claw cleanup')
  text = text.replace(/\bhermes /g, 'sclip ')
  return text
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
      theme: {
        background: '#000000',
        foreground: '#f5f5f5',
        cursor: '#ffffff',
        cursorAccent: '#000000',
        selectionBackground: 'rgba(255, 255, 255, 0.22)',
        black: '#171717',
        red: '#f87171',
        green: '#e4e4e7',
        yellow: '#e4e4e7',
        blue: '#d4d4d8',
        magenta: '#d4d4d8',
        cyan: '#f4f4f5',
        white: '#ffffff',
        brightBlack: '#52525b',
        brightRed: '#ef4444',
        brightGreen: '#f4f4f5',
        brightYellow: '#ffffff',
        brightBlue: '#f4f4f5',
        brightMagenta: '#fafafa',
        brightCyan: '#ffffff',
        brightWhite: '#ffffff',
      },
    })
    const fit = new FitAddon()
    terminal.loadAddon(fit)
    terminal.loadAddon(new WebLinksAddon())
    terminal.open(node)
    fit.fit()
    onTerminalReady?.({ clear: () => terminal.clear() })

    let ready = false
    let replayHandlers: Array<{ dispose: () => void }> = []
    let lastSequence = 0
    const queuedOutput: Array<{ sequence: number; data: string }> = []
    const acceptOutput = (event: { sequence: number; data: string }) => {
      if (event.sequence <= lastSequence) return
      lastSequence = event.sequence
      terminal.write(transformTerminalOutput(event.data))
    }
    const writeOutput = (payload: unknown) => {
      const event = payload as { projectId?: unknown; sessionId?: unknown; sequence?: unknown; data?: unknown }
      if (event.projectId !== projectId || event.sessionId !== sessionId ||
          !Number.isSafeInteger(event.sequence) || typeof event.data !== 'string') return
      const output = { sequence: event.sequence as number, data: event.data }
      if (ready) acceptOutput(output)
      else queuedOutput.push(output)
    }

    const unsubscribe = window.api.on('sclip:terminal_output', writeOutput)
    let openPromise: Promise<SclipTerminalSnapshot> | undefined
    let inputQueue: Promise<void> = Promise.resolve()
    const disposable = terminal.onData(data => {
      // IPC validation is async; serialize writes so fast typing cannot arrive
      // at the PTY out of order or race its first launch.
      inputQueue = inputQueue.then(async () => {
        await openPromise
        if (active) await sclipTerminalInput(projectId, sessionId, data)
      }).catch(problem => {
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

    openPromise = sclipOpenTerminal(projectId, sessionId, terminal.cols, terminal.rows)
    void openPromise.then(snapshot => {
      if (!active) return
      lastSequence = snapshot.sequence
      const finishReplay = () => {
        replayHandlers.forEach(handler => handler.dispose())
        replayHandlers = []
        if (!active) return
        terminal.scrollToBottom()
        ready = true
        for (const event of queuedOutput.sort((a, b) => a.sequence - b.sequence)) acceptOutput(event)
        queuedOutput.length = 0
      }
      if (snapshot.history) {
        // History is already answered output, not a fresh child request. Consume
        // only historical queries, never user input or live terminal responses.
        // xterm parses asynchronously: keep hooks until the write callback and
        // queue live output until then so live queries retain normal behavior.
        replayHandlers = [suppressHistoricalQueries(terminal)]
        terminal.write(transformTerminalOutput(snapshot.history), finishReplay)
      } else finishReplay()
    }).catch(problem => {
      if (active) setError(problem instanceof Error ? problem.message : String(problem))
    })
    return () => {
      active = false
      observer.disconnect()
      disposable.dispose()
      unsubscribe()
      replayHandlers.forEach(handler => handler.dispose())
      terminal.dispose()
    }
  }, [projectId, sessionId])

  return <div className="sclip-live-terminal" aria-label="Hermes interactive terminal">
    {error && <div className="sclip-terminal-error" role="alert">{error}</div>}
    <div ref={host} className="sclip-terminal-host" />
  </div>
}
