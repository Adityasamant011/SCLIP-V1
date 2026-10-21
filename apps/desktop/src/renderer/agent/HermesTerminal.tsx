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
  onRetry?: () => void | Promise<void>
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
export function HermesTerminal({ projectId, sessionId, onTerminalReady, onRetry }: Props) {
  const host = useRef<HTMLDivElement>(null)
  const [error, setError] = useState<string | null>(null)
  const [starting, setStarting] = useState(true)
  const retry = useRef(onRetry)
  retry.current = onRetry

  useEffect(() => {
    const node = host.current
    if (!node) return undefined
    let active = true
    let failed = false
    let outputSeen = false
    setError(null)
    setStarting(true)
    const fail = (message: string) => {
      failed = true
      if (active) { setStarting(false); setError(message) }
    }
    const startupTimeout = setTimeout(() => {
      if (!outputSeen) fail('The terminal did not produce output. Retry the connection.')
    }, 30_000)
    const noteOutput = (data: string) => {
      const visible = data.replace(/\x1b\][^\x07]*(?:\x07|\x1b\\)/g, '').replace(/\x1b\[[0-?]*[ -/]*[@-~]/g, '').replace(/[\x00-\x20\x7f]/g, '')
      if (!visible || failed || !active) return
      outputSeen = true
      clearTimeout(startupTimeout)
      setStarting(false)
    }
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
    let finishStartup!: () => void
    const startupReady = new Promise<void>(resolve => { finishStartup = resolve })
    let replayHandlers: Array<{ dispose: () => void }> = []
    let lastSequence = 0
    const queuedOutput: Array<{ sequence: number; data: string }> = []
    const acceptOutput = (event: { sequence: number; data: string }) => {
      if (event.sequence <= lastSequence) return
      lastSequence = event.sequence
      noteOutput(event.data)
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
    const unsubscribeExit = window.api.on('sclip:terminal_exit', payload => {
      const event = payload as { projectId?: string; sessionId?: string; code?: number }
      if (event.projectId !== projectId || event.sessionId !== sessionId) return
      clearTimeout(startupTimeout)
      fail(`Sclip terminal stopped${typeof event.code === 'number' ? ` (exit ${event.code})` : ''}. Retry the connection.`)
    })
    let openPromise: Promise<SclipTerminalSnapshot> | undefined
    let inputQueue: Promise<void> = Promise.resolve()
    const disposable = terminal.onData(data => {
      // IPC validation is async; serialize writes so fast typing cannot arrive
      // at the PTY out of order or race its first launch.
      inputQueue = inputQueue.then(async () => {
        await openPromise
        await startupReady
        if (active && !failed) {
          // Keep typing visible even if the user previously scrolled up, and
          // synchronize the PTY width before it renders another input row.
          terminal.scrollToBottom()
          await syncSize()
          await sclipTerminalInput(projectId, sessionId, data)
        }
      }).catch(problem => {
        if (active) setError(problem instanceof Error ? problem.message : String(problem))
      })
    })
    let lastCols = -1
    let lastRows = -1

    const syncSize = async () => {
      const { cols, rows } = terminal
      if (cols === lastCols && rows === lastRows) return
      await sclipTerminalResize(projectId, sessionId, cols, rows)
      lastCols = cols
      lastRows = rows
    }

    const resize = () => {
      if (!active || failed) return
      try {
        fit.fit()
        if (ready) {
          // Opening the PTY is asynchronous. Earlier resize messages were lost
          // while no session existed, leaving Hermes wider than the panel.
          // Serialize size changes with keystrokes and read the latest size.
          inputQueue = inputQueue.then(async () => {
            if (active) await syncSize()
          }).catch(problem => {
            if (active) setError(problem instanceof Error ? problem.message : String(problem))
          })
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
      if (!active || failed) return
      lastSequence = snapshot.sequence
      const finishReplay = () => {
        replayHandlers.forEach(handler => handler.dispose())
        replayHandlers = []
        if (!active || failed) return
        terminal.scrollToBottom()
        ready = true
        finishStartup()
        resize()
        for (const event of queuedOutput.sort((a, b) => a.sequence - b.sequence)) acceptOutput(event)
        queuedOutput.length = 0
      }
      if (snapshot.history) {
        noteOutput(snapshot.history)
        // History is already answered output, not a fresh child request. Consume
        // only historical queries, never user input or live terminal responses.
        // xterm parses asynchronously: keep hooks until the write callback and
        // queue live output until then so live queries retain normal behavior.
        replayHandlers = [suppressHistoricalQueries(terminal)]
        terminal.write(transformTerminalOutput(snapshot.history), finishReplay)
      } else finishReplay()
    }).catch(problem => {
      clearTimeout(startupTimeout)
      fail(problem instanceof Error ? problem.message : String(problem))
    })
    return () => {
      active = false
      clearTimeout(startupTimeout)
      finishStartup()
      observer.disconnect()
      disposable.dispose()
      unsubscribe()
      unsubscribeExit()
      replayHandlers.forEach(handler => handler.dispose())
      terminal.dispose()
    }
  }, [projectId, sessionId])

  return <div className="sclip-live-terminal" aria-label="Sclip interactive terminal">
    {starting && !error && <div className="sclip-terminal-starting" role="status">Opening Sclip terminal…</div>}
    {error && <div className="sclip-terminal-error" role="alert">{error}
      {onRetry && <button type="button" className="sclip-terminal-retry-btn" onClick={() => void retry.current?.()}>Retry Connection</button>}
    </div>}
    <div ref={host} className="sclip-terminal-host" />
  </div>
}
