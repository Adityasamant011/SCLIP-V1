// Acceptance-only controls. No key, prompt, tool or editorial policy is authored here.
export const MODEL = 'openai/gpt-5.6-luna-pro';
export const BASE = 'https://openrouter.ai/api/v1';
export function acceptanceConfig(generated, cwd) {
  return {...generated,
    model: {provider:'openrouter', default:MODEL, base_url:BASE, max_tokens:8192},
    fallback_model: [], fallback_providers: [],
    provider_routing: {only:['openai'], order:['openai'], ignore:['openai/flex','openai/fast'], require_parameters:true},
    memory: {memory_enabled:false}, compression:{enabled:false},
    agent:{...generated.agent, max_turns:24},
    display:{...generated.display, show_reasoning:false},
    terminal:{...generated.terminal, cwd},
    auxiliary:{title_generation:{enabled:false}, background_review:{enabled:false}, free_only:true},
  };
}
export function cleanRoutingEnvironment(source) {
  const env = {...source};
  // Eliminate inherited endpoint/provider overrides; the supported OpenRouter route owns auth.
  for (const name of ['OPENAI_BASE_URL','OPENROUTER_BASE_URL','CUSTOM_BASE_URL','HERMES_INFERENCE_PROVIDER',
    'OPENAI_API_KEY','OPENROUTER_API_KEY','ANTHROPIC_API_KEY','DEEPSEEK_API_KEY','GROQ_API_KEY','GEMINI_API_KEY']) delete env[name];
  return env;
}
