import { useEffect, useMemo, useState } from 'react'
import {
  Check,
  Eye,
  EyeOff,
  RotateCcw,
  ShieldCheck,
  Sparkles,
  Terminal,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { AppInput } from '../components/AppInput'
import { AppNumberField } from '../components/AppNumberField'
import {
  sclipGetHermesConfig,
  sclipGetHermesStatus,
  sclipSetHermesConfig,
  type HermesConfigView,
  type HermesStatus,
} from '../ipc/sclip'
import { AgentSection } from './AgentSection'

interface ProviderDefinition {
  id: string
  name: string
  description: string
  badge: string
  models: Array<{ id: string; name: string }>
  requiresApiKey: boolean
  keyName?: string
  placeholderKey?: string
  defaultBaseUrl?: string
}

const PROVIDERS: ProviderDefinition[] = [
  {
    id: 'openrouter',
    name: 'OpenRouter',
    description: 'Unified multi-model gateway (Anthropic, OpenAI, DeepSeek, Meta, etc.)',
    badge: 'Multi-Model',
    models: [
      { id: 'dots-studio/dots-3-note-preview:free', name: 'Dots 3 Note Preview (Free)' },
      { id: 'anthropic/claude-3.7-sonnet', name: 'Claude 3.7 Sonnet' },
      { id: 'anthropic/claude-3.5-haiku', name: 'Claude 3.5 Haiku' },
      { id: 'openai/gpt-4o', name: 'GPT-4o' },
      { id: 'openai/o3-mini', name: 'o3-mini' },
      { id: 'deepseek/deepseek-chat', name: 'DeepSeek V3' },
      { id: 'deepseek/deepseek-r1', name: 'DeepSeek R1' },
      { id: 'meta-llama/llama-3.3-70b-instruct', name: 'Llama 3.3 70B' },
    ],
    requiresApiKey: true,
    keyName: 'openrouter',
    placeholderKey: 'sk-or-v1-...',
  },
  {
    id: 'anthropic',
    name: 'Anthropic (Claude)',
    description: 'Direct access to frontier Claude reasoning and agentic models',
    badge: 'Direct API',
    models: [
      { id: 'claude-3-7-sonnet-latest', name: 'Claude 3.7 Sonnet (Recommended)' },
      { id: 'claude-3-5-haiku-latest', name: 'Claude 3.5 Haiku (Fast)' },
      { id: 'claude-3-5-sonnet-latest', name: 'Claude 3.5 Sonnet' },
      { id: 'claude-3-opus-latest', name: 'Claude 3 Opus' },
    ],
    requiresApiKey: true,
    keyName: 'anthropic',
    placeholderKey: 'sk-ant-api03-...',
  },
  {
    id: 'openai-api',
    name: 'OpenAI',
    description: 'Direct access to OpenAI GPT-4o and o-series reasoning models',
    badge: 'Direct API',
    models: [
      { id: 'gpt-4o', name: 'GPT-4o' },
      { id: 'gpt-4o-mini', name: 'GPT-4o Mini' },
      { id: 'o3-mini', name: 'o3-mini' },
      { id: 'o1', name: 'o1' },
    ],
    requiresApiKey: true,
    keyName: 'openai',
    placeholderKey: 'sk-proj-...',
  },
  {
    id: 'deepseek',
    name: 'DeepSeek',
    description: 'High performance open frontier models from DeepSeek',
    badge: 'Direct API',
    models: [
      { id: 'deepseek-chat', name: 'DeepSeek-V3' },
      { id: 'deepseek-reasoner', name: 'DeepSeek-R1 (Reasoning)' },
    ],
    requiresApiKey: true,
    keyName: 'deepseek',
    placeholderKey: 'sk-...',
  },
  {
    id: 'groq',
    name: 'Groq',
    description: 'Ultra-fast inference for Llama 3.3 and DeepSeek R1 models',
    badge: 'Ultra-Fast',
    models: [
      { id: 'llama-3.3-70b-versatile', name: 'Llama 3.3 70B Versatile' },
      { id: 'llama-3.1-8b-instant', name: 'Llama 3.1 8B Instant' },
      { id: 'deepseek-r1-distill-llama-70b', name: 'DeepSeek R1 Distill 70B' },
    ],
    requiresApiKey: true,
    keyName: 'groq',
    placeholderKey: 'gsk_...',
  },
  {
    id: 'gemini',
    name: 'Google Gemini',
    description: 'Google AI Studio multimodal and reasoning models',
    badge: 'Direct API',
    models: [
      { id: 'gemini-2.0-flash', name: 'Gemini 2.0 Flash' },
      { id: 'gemini-2.0-flash-thinking-exp-01-21', name: 'Gemini 2.0 Flash Thinking' },
      { id: 'gemini-1.5-pro', name: 'Gemini 1.5 Pro' },
    ],
    requiresApiKey: true,
    keyName: 'gemini',
    placeholderKey: 'AIzaSy...',
  },
  {
    id: 'ollama',
    name: 'Ollama (Local)',
    description: 'Completely local, private inference via Ollama server',
    badge: 'Local / Offline',
    models: [
      { id: 'llama3.2', name: 'Llama 3.2' },
      { id: 'qwen2.5:14b', name: 'Qwen 2.5 14B' },
      { id: 'qwen2.5-coder:14b', name: 'Qwen 2.5 Coder 14B' },
      { id: 'mistral', name: 'Mistral 7B' },
    ],
    requiresApiKey: false,
    defaultBaseUrl: 'http://localhost:11434/v1',
  },
  {
    id: 'lmstudio',
    name: 'LM Studio (Local)',
    description: 'Local inference via LM Studio server',
    badge: 'Local / Offline',
    models: [
      { id: 'local-model', name: 'Current Active Model in LM Studio' },
    ],
    requiresApiKey: false,
    defaultBaseUrl: 'http://localhost:1234/v1',
  },
  {
    id: 'custom',
    name: 'Custom Endpoint',
    description: 'Any OpenAI-compatible server (vLLM, Together, local proxy)',
    badge: 'Custom URL',
    models: [],
    requiresApiKey: false,
    defaultBaseUrl: 'http://localhost:8000/v1',
  },
]

export function HermesSettingsSection() {
  const [tab, setTab] = useState<'hermes' | 'mcp'>('hermes')
  const [config, setConfig] = useState<HermesConfigView | null>(null)
  const [status, setStatus] = useState<HermesStatus | null>(null)
  const [loading, setLoading] = useState(true)

  const [selectedProviderId, setSelectedProviderId] = useState('openrouter')
  const [selectedModel, setSelectedModel] = useState('')
  const [isCustomModel, setIsCustomModel] = useState(false)
  const [customModelInput, setCustomModelInput] = useState('')
  const [apiKeyInput, setApiKeyInput] = useState('')
  const [showApiKey, setShowApiKey] = useState(false)
  const [baseUrlInput, setBaseUrlInput] = useState('')
  const [maxIterations, setMaxIterations] = useState(30)

  const [saving, setSaving] = useState(false)
  const [saveSuccess, setSaveSuccess] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  const activeProvider: ProviderDefinition = useMemo(
    () => PROVIDERS.find(p => p.id === selectedProviderId) ?? PROVIDERS[0]!,
    [selectedProviderId]
  )

  const fetchConfig = async () => {
    try {
      const [cfg, stat] = await Promise.all([
        sclipGetHermesConfig(),
        sclipGetHermesStatus().catch(() => null),
      ])
      setConfig(cfg)
      setStatus(stat)

      let matchedProvider = PROVIDERS.find(p => p.id === cfg.provider)
      if (!matchedProvider) {
        if (cfg.provider === 'openai') matchedProvider = PROVIDERS.find(p => p.id === 'openai-api')
        else matchedProvider = PROVIDERS.find(p => p.id === 'custom')
      }
      const provId = matchedProvider ? matchedProvider.id : 'openrouter'
      setSelectedProviderId(provId)

      const providerModels = matchedProvider?.models ?? []
      const knownModel = providerModels.find(m => m.id === cfg.model)
      if (knownModel) {
        setSelectedModel(cfg.model)
        setIsCustomModel(false)
        setCustomModelInput('')
      } else {
        setSelectedModel('custom')
        setIsCustomModel(true)
        setCustomModelInput(cfg.model)
      }

      setBaseUrlInput(cfg.customBaseUrl || matchedProvider?.defaultBaseUrl || '')
      setMaxIterations(cfg.maxIterations || 30)
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : String(err))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void fetchConfig()
  }, [])

  const handleProviderChange = (newProvId: string) => {
    setSelectedProviderId(newProvId)
    setApiKeyInput('')
    setSaveSuccess(false)
    setErrorMessage(null)

    const prov = PROVIDERS.find(p => p.id === newProvId)
    if (prov) {
      if (prov.defaultBaseUrl) {
        setBaseUrlInput(prov.defaultBaseUrl)
      } else {
        setBaseUrlInput('')
      }
      if (prov.models.length > 0 && prov.models[0]) {
        setSelectedModel(prov.models[0].id)
        setIsCustomModel(false)
        setCustomModelInput('')
      } else {
        setSelectedModel('custom')
        setIsCustomModel(true)
        setCustomModelInput('')
      }
    }
  }

  const handleModelChange = (modelId: string) => {
    if (modelId === 'custom') {
      setIsCustomModel(true)
      setSelectedModel('custom')
    } else {
      setIsCustomModel(false)
      setSelectedModel(modelId)
    }
    setSaveSuccess(false)
  }

  const handleSave = async () => {
    setSaving(true)
    setErrorMessage(null)
    setSaveSuccess(false)

    const finalModel = isCustomModel ? customModelInput.trim() : selectedModel
    if (!finalModel) {
      setErrorMessage('Please specify or select a model name.')
      setSaving(false)
      return
    }

    try {
      await sclipSetHermesConfig({
        provider: activeProvider.id,
        model: finalModel,
        customBaseUrl: baseUrlInput.trim() || undefined,
        maxIterations: maxIterations || 30,
        apiKey: apiKeyInput.trim() ? apiKeyInput.trim() : undefined,
      })
      setSaveSuccess(true)
      setApiKeyInput('')
      await fetchConfig()
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : String(err))
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="sclip-settings-loading">
        <RotateCcw className="animate-spin" size={20} />
        <span>Loading Hermes configuration…</span>
      </div>
    )
  }

  const hasKeyConfigured = activeProvider.keyName
    ? !!config?.configuredKeys[activeProvider.keyName as keyof typeof config.configuredKeys]
    : false

  return (
    <div className="sclip-settings-root">
      <div className="sclip-settings-mode-switch">
        <button
          type="button"
          className={`sclip-settings-mode-tab ${tab === 'hermes' ? 'active' : ''}`}
          onClick={() => setTab('hermes')}
        >
          <Sparkles size={14} />
          <span>Hermes Agent & Models</span>
        </button>
        <button
          type="button"
          className={`sclip-settings-mode-tab ${tab === 'mcp' ? 'active' : ''}`}
          onClick={() => setTab('mcp')}
        >
          <Terminal size={14} />
          <span>External MCP Setup (Claude, Cursor, Codex)</span>
        </button>
      </div>

      {tab === 'mcp' ? (
        <AgentSection />
      ) : (
        <div className="sclip-settings-body">
          {/* Header Info */}
          <div className="sclip-settings-header-card">
            <div className="sclip-settings-header-status">
              <span className={`sclip-settings-status-pill ${status?.online ? 'online' : 'offline'}`}>
                {status?.online ? 'Hermes Gateway Online' : 'Hermes Offline'}
              </span>
              <span className="sclip-settings-status-mcp">
                {status?.mcpTools ?? 93} WeftCut MCP Tools Connected
              </span>
            </div>
            <p className="sclip-settings-header-sub">
              Select your AI provider and model. Credentials are encrypted in macOS Keychain.
            </p>
          </div>

          {/* Provider Selection Grid */}
          <div className="sclip-settings-section-title">Inference Provider</div>
          <div className="sclip-provider-grid">
            {PROVIDERS.map(prov => {
              const isSelected = prov.id === selectedProviderId
              const isSaved = prov.keyName && config?.configuredKeys[prov.keyName as keyof typeof config.configuredKeys]
              return (
                <button
                  key={prov.id}
                  type="button"
                  className={`sclip-provider-card ${isSelected ? 'selected' : ''}`}
                  onClick={() => handleProviderChange(prov.id)}
                >
                  <div className="sclip-provider-card-top">
                    <span className="sclip-provider-card-name">{prov.name}</span>
                    <span className="sclip-provider-card-badge">{prov.badge}</span>
                  </div>
                  <div className="sclip-provider-card-desc">{prov.description}</div>
                  {isSaved && (
                    <div className="sclip-provider-saved-badge">
                      <ShieldCheck size={12} /> Key Saved
                    </div>
                  )}
                </button>
              )
            })}
          </div>

          {/* Provider Details Form */}
          <div className="sclip-provider-form-box">
            <div className="sclip-form-row">
              <label className="sclip-form-label">Model Selection</label>
              <div className="sclip-form-control-col">
                <select
                  className="sclip-select-input"
                  value={isCustomModel ? 'custom' : selectedModel}
                  onChange={e => handleModelChange(e.target.value)}
                >
                  {activeProvider.models.map(m => (
                    <option key={m.id} value={m.id}>
                      {m.name} ({m.id})
                    </option>
                  ))}
                  <option value="custom">Custom Model ID…</option>
                </select>

                {isCustomModel && (
                  <div className="sclip-custom-model-row">
                    <AppInput
                      value={customModelInput}
                      placeholder="e.g. claude-3-7-sonnet-latest or deepseek-chat"
                      onValueChange={setCustomModelInput}
                    />
                    <span className="sclip-input-hint">Type exact model identifier recognized by this provider</span>
                  </div>
                )}
              </div>
            </div>

            {/* API Key Field */}
            {activeProvider.requiresApiKey && (
              <div className="sclip-form-row">
                <label className="sclip-form-label">
                  API Key
                  {hasKeyConfigured && (
                    <span className="sclip-key-status-tag">
                      <ShieldCheck size={11} /> Saved in Keychain
                    </span>
                  )}
                </label>
                <div className="sclip-form-control-col">
                  <div className="sclip-api-key-wrapper">
                    <AppInput
                      type={showApiKey ? 'text' : 'password'}
                      value={apiKeyInput}
                      placeholder={hasKeyConfigured ? '•••••••••••••••• (Leave blank to keep existing key)' : activeProvider.placeholderKey || 'Paste API Key here'}
                      onValueChange={setApiKeyInput}
                    />
                    <button
                      type="button"
                      className="sclip-key-eye-btn"
                      onClick={() => setShowApiKey(!showApiKey)}
                      title={showApiKey ? 'Hide key' : 'Show key'}
                    >
                      {showApiKey ? <EyeOff size={14} /> : <Eye size={14} />}
                    </button>
                  </div>
                  <span className="sclip-input-hint">
                    Key is encrypted via macOS Keychain safeStorage and never logged.
                  </span>
                </div>
              </div>
            )}

            {/* Base URL (For Local/Custom) */}
            {(activeProvider.defaultBaseUrl !== undefined || activeProvider.id === 'custom') && (
              <div className="sclip-form-row">
                <label className="sclip-form-label">Base URL</label>
                <div className="sclip-form-control-col">
                  <AppInput
                    value={baseUrlInput}
                    placeholder={activeProvider.defaultBaseUrl || 'http://localhost:11434/v1'}
                    onValueChange={setBaseUrlInput}
                  />
                  <span className="sclip-input-hint">
                    Endpoint URL for OpenAI-compatible completions. No API key needed for local servers.
                  </span>
                </div>
              </div>
            )}

            {/* Runtime Parameters */}
            <div className="sclip-form-row">
              <label className="sclip-form-label">Max Agent Steps</label>
              <div className="sclip-form-control-col">
                <div className="sclip-iterations-row">
                  <AppNumberField
                    value={maxIterations}
                    min={5}
                    max={100}
                    step={1}
                    onValueChange={val => setMaxIterations(val || 30)}
                  />
                  <span className="sclip-iterations-hint">Default is 30 iterations per command</span>
                </div>
              </div>
            </div>

            {/* Feedback Messages */}
            {errorMessage && (
              <div className="sclip-form-alert error" role="alert">
                {errorMessage}
              </div>
            )}
            {saveSuccess && (
              <div className="sclip-form-alert success" role="status">
                <Check size={14} /> Settings saved! Hermes is reloading with the new provider and model.
              </div>
            )}

            {/* Actions */}
            <div className="sclip-form-actions">
              <Button
                type="button"
                onClick={handleSave}
                disabled={saving}
                className="sclip-save-btn"
              >
                {saving ? (
                  <>
                    <RotateCcw className="animate-spin" size={14} />
                    <span>Saving & Restarting…</span>
                  </>
                ) : (
                  <>
                    <Check size={14} />
                    <span>Save & Apply</span>
                  </>
                )}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
