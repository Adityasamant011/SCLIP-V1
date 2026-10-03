import { useEffect, useState } from 'react'
import { Settings, RotateCcw, Eraser, Bot } from 'lucide-react'
import { openSclipSettings, sclipGetHermesConfig, sclipGetHermesStatus, type HermesConfigView } from '../ipc/sclip'

interface Props {
  onRestartTerminal?: (() => void | Promise<void>) | undefined
  onClearTerminal?: (() => void) | undefined
  isRestarting?: boolean | undefined
}

export function AgentPanelHeader({ onRestartTerminal, onClearTerminal, isRestarting }: Props) {
  const [config, setConfig] = useState<HermesConfigView | null>(null)
  const [isOnline, setIsOnline] = useState(false)

  const refresh = async () => {
    try {
      const [cfg, status] = await Promise.all([
        sclipGetHermesConfig().catch(() => null),
        sclipGetHermesStatus().catch(() => null),
      ])
      if (cfg) setConfig(cfg)
      setIsOnline(!!status?.online)
    } catch { /* ignore */ }
  }

  useEffect(() => {
    void refresh()
    const timer = setInterval(() => void refresh(), 3000)
    const unsubscribe = window.api.on('sclip:hermes_config_changed', () => void refresh())
    return () => {
      clearInterval(timer)
      unsubscribe()
    }
  }, [])

  const modelLabel = config?.model ? config.model.split('/').pop() : 'default'
  const providerLabel = config?.provider || 'hermes'

  return (
    <div className="sclip-agent-header">
      <button
        type="button"
        className="sclip-agent-model-badge"
        onClick={() => openSclipSettings('agent')}
        title="Click to configure Hermes model or provider"
        aria-label="Hermes Model Configuration"
      >
        <span className={`sclip-agent-status-dot ${isOnline ? 'online' : 'offline'}`} />
        <Bot size={13} className="sclip-agent-bot-icon" />
        <span className="sclip-agent-provider-tag">{providerLabel}</span>
        <span className="sclip-agent-separator">·</span>
        <span className="sclip-agent-model-tag">{modelLabel}</span>
      </button>
      <div className="sclip-agent-actions">
        {onClearTerminal && (
          <button
            type="button"
            className="sclip-agent-action-btn"
            onClick={onClearTerminal}
            title="Clear terminal buffer"
            aria-label="Clear terminal"
          >
            <Eraser size={13} />
          </button>
        )}
        {onRestartTerminal && (
          <button
            type="button"
            className={`sclip-agent-action-btn ${isRestarting ? 'spinning' : ''}`}
            onClick={onRestartTerminal}
            title="Restart Hermes Terminal (reloads config & environment)"
            aria-label="Restart Hermes terminal"
            disabled={isRestarting}
          >
            <RotateCcw size={13} />
          </button>
        )}
        <button
          type="button"
          className="sclip-agent-action-btn sclip-agent-settings-btn"
          onClick={() => openSclipSettings('agent')}
          title="Hermes Agent Settings (Model, Provider, API Keys)"
          aria-label="Hermes settings"
        >
          <Settings size={13} />
        </button>
      </div>
    </div>
  )
}
