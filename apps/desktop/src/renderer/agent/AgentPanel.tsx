import { SclipAiPanel } from './SclipAiPanel'

/**
 * Sclip deliberately owns this dock: it is an interactive Hermes terminal,
 * not a second chat, activity feed, or editor-control surface.
 */
export function AgentPanel(_props: { editor?: boolean }) {
  return <SclipAiPanel />
}
