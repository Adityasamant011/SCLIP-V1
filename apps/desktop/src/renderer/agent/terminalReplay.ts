import type { Terminal } from '@xterm/xterm'

/** Suppress only already-answered queries while xterm parses a history write. */
export function suppressHistoricalQueries(terminal: Pick<Terminal, 'parser'>) {
  const handlers = [
    terminal.parser.registerOscHandler(11, data => data === '?'),
    terminal.parser.registerCsiHandler({ final: 'c' }, params => params.length === 0 || (params.length === 1 && params[0] === 0)),
  ]
  return { dispose: () => handlers.forEach(handler => handler.dispose()) }
}
