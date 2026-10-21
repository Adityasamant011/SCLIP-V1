import fs from 'node:fs'
import {isProviderConfigured} from '../media/external/credentials.js'
import { createHash } from 'node:crypto'
import type { McpServerOptions } from '../mcp/server.js'
import { getVisionRuntime } from './visionRuntime.js'
import { runtimeScheduler } from './runtimeScheduler.js'
import { runtimeTrace } from './runtimeTrace.js'

export const RUNTIME_STATUS_TOOL={name:'get_sclip_runtime_status',description:'Read actual Sclip model-role readiness, configured specialist services, resource queues and bounded local timing metadata. No model loading, generation, downloads or provider calls. Configured/unverified is distinct from ready. Use this instead of repeatedly trying an unavailable capability.',inputSchema:{type:'object',properties:{},additionalProperties:false}} as const

export async function runtimeCapabilities(opts:McpServerOptions) {
  const unavailable:string[]=[]
  const read=<T>(role:string,fn:(()=>T)|undefined,fallback:T):T=>{
    try{return fn?.()??fallback}catch{unavailable.push(role);return fallback}
  }
  let vision
  try{vision=await getVisionRuntime().status()}catch{unavailable.push('frame_vision');vision={state:'unavailable',model:'unknown',running:false,modelLoaded:false}}
  const whole=read('whole_video',opts.getVlm,undefined),generation=read('image_and_sound',()=>opts.localGeneration?.status(),undefined)
  const permissions=read('permissions',opts.getRuntimePermissions,undefined),semantic=read('semantic_audio',()=>opts.audioUnderstanding?.status(),undefined)
  const reasoning=read('reasoning',opts.getReasoningProfile,undefined),speech=read('speech_recognition',opts.getPreferredEngine,undefined)
  const providers=read('stock',()=>opts.externalMediaService?.getAvailableProviders?.()??[],[]).map(provider=>({provider,state:read('stock:'+provider,()=>isProviderConfigured(provider),false)?'configured_unverified':'not_configured'}))
  return {contract:'sclip.runtime.v1',roles:{
    reasoning:reasoning??{state:'session_selected',readiness:'unverified',native_image_support:'provider_dependent'},
    frame_vision:{...vision,local:true,coverage:'sampled_frames',observation_is_fallible:true},
    whole_video:{state:whole&&Object.keys(whole.config).length?'configured_unverified':'not_configured',backend:whole?.preferred??null,independent_of_frame_vision:true},
    speech_recognition:{state:speech?'configured_unverified':'not_configured',backend:speech??null,coverage:'source_or_rendered_mix_as_requested'},
    semantic_audio:{...semantic,state:semantic?.status==='ready'?'configured_unverified':semantic?.status??'not_available',local:true,coverage:'short_coarse_event_windows_not_word_timing'},
    speech_generation:{state:opts.listSpeechVoices?'service_available':'not_available',default:'local_kokoro',fallback:'only_when_explicitly_requested',quality:'not_certified'},
    image_and_sound:generation??{state:'not_available'},
    jev_passage_ranking:{state:!opts.evaluateSourcePassages?'disabled':permissions?.jev_credentials?'configured_unverified':'credentials_unverified_or_missing',local:false,optional:true,visual_truth:false},
    jev_background:{state:permissions?.jev_background?'authorized_unverified':'disabled',local:false,optional:true,advisory_only:true},
    jev_failure_advice:{state:permissions?.jev_failure?'authorized_unverified':'disabled',local:false,optional:true,advisory_only:true},
    background_local_perception:{state:permissions?.local_background_perception?'authorized_unverified':'disabled',local:true,scope:'BackgroundReviewer optional perception; live playhead feedback is a separate current reviewer service'},
    stock:{state:opts.enableExternalMedia?'enabled':'disabled',providers,requires_provider_configuration:true},
  },unavailable_status_reads:unavailable,resources:runtimeScheduler.snapshot(),timing:runtimeTrace.snapshot(read('identity',opts.getRuntimeIdentity,undefined)?.turn_id),
  limitations:'Service presence is not model readiness or permission to send media remotely. No aesthetic or completion certification. Native image loading is not a separate local observation.'}
}

/** Model config identity includes local file replacement, without exposing config
 * contents or touching weights. This is a cache key, never a readiness claim. */
export function configurationIdentity(value:unknown):string {
  const files:Array<unknown>=[]
  function walk(v:unknown,depth=0){
    if(depth>8)return
    if(typeof v==='string'&&(v.startsWith('/')||/^[A-Za-z]:[\\/]/.test(v))){const s=fs.statSync(v,{throwIfNoEntry:false});files.push([v,s?.size,s?.mtimeMs,s?.ctimeMs])}
    else if(v&&typeof v==='object')for(const child of Object.values(v))walk(child,depth+1)
  }
  walk(value)
  return createHash('sha256').update(JSON.stringify({value,files})).digest('hex')
}
