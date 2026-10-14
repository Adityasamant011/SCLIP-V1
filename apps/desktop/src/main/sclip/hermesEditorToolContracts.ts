import fs from 'node:fs'
import path from 'node:path'
import {parse,stringify} from 'yaml'

/** Jurisdiction/provenance only. Hermes chooses meaning, evidence, scope, or no learning. */
export const GENERAL_MEMORY_CONTRACT = 'SCLIP general memory: new add/replace writes require memory_domain. YOU classify the purpose: general means non-editing facts, environment/tool conventions or communication preferences. Creator video-editing preferences, taste, caption/pacing/framing/audio choices and interpretations of corrections are creator_style and belong in the canonical mcp__weftcut__creator_style_memory tool, not MEMORY.md or USER.md. This native tool refuses creator_style writes; discover/describe the exact canonical tool and use actual evidence IDs and fresh creator/revision bindings. You decide whether a supported tentative interpretation exists, its meaning and applicability, or no learning. Remove remains the native operation. General add/replace/remove, target memory/user, atomic operations arrays, bounded stores and session-frozen context retain native behavior. One memory_domain covers the entire atomic batch. Do not repeat a completed write.'

export function creatorMemoryProvenanceIds(context:string):string[] {
  // The existing context is a header followed by one JSON payload. Never infer
  // editorial meaning from its text or turn it into a preference.
  try {
    // Canonical context currently uses a literal \\n transport separator;
    // accept actual line breaks too. Do not silently drop real producer IDs.
    const boundary=context.match(/(?:\n|\\n)(\{[\s\S]*)$/)
    if (!boundary) return []
    const payload=JSON.parse(boundary[1]!) as {preferences?:Array<{id?:string;support?:string[];counterexamples?:string[]}>;recent_evidence?:Array<{id?:string}>}
    const ids=[...(payload.preferences??[]).flatMap(item=>[item.id,...(item.support??[]),...(item.counterexamples??[])]),...(payload.recent_evidence??[]).map(item=>item.id)]
    return [...new Set(ids.filter((id):id is string=>typeof id==='string'&&/^[0-9a-f-]{36}$/i.test(id)))].slice(0,80)
  } catch {return []}
}

export const HERMES_EDITOR_TOOL_CONTRACT_PLUGIN = `import os,json,re
DESCRIPTION=${JSON.stringify(GENERAL_MEMORY_CONTRACT)}
def register(ctx):
    if not os.environ.get("SCLIP_ACTIVE_PROJECT_ID"): return
    from tools.memory_tool import MEMORY_SCHEMA
    from tools.registry import registry
    entry=registry.get_entry("memory")
    if entry is None or entry.schema is not MEMORY_SCHEMA: return
    original=getattr(entry.handler,"_sclip_original_handler",entry.handler)
    if getattr(original,"__module__","")!="tools.memory_tool": return
    # Reject duplication of known canonical identifiers, not style keywords.
    # No preference meaning, confidence or edit is chosen by this boundary.
    try:
        ids=json.loads(os.environ.get("SCLIP_CREATOR_PROVENANCE_IDS","[]"))
        ids=[value.lower() for value in ids if isinstance(value,str) and re.fullmatch(r"[0-9a-fA-F]{8}(?:-[0-9a-fA-F]{4}){3}-[0-9a-fA-F]{12}",value)] if isinstance(ids,list) else []
    except Exception: ids=[]
    def memory_gate(args):
        operations=args.get("operations")
        # Native memory treats an empty batch as the single-op shape.
        operations=operations if isinstance(operations,list) and operations else [args]
        writing=any(isinstance(op,dict) and op.get("action") in ("add","replace") for op in operations)
        if writing and args.get("memory_domain")!="general":
            return json.dumps({"success":False,"error":"Declare the memory domain before a new write. general is only non-editing facts/tool conventions/communication. Creator editing preferences and correction interpretations belong in canonical creator_style_memory, even without evidence IDs in the prose. No write occurred.","declared_domain":args.get("memory_domain"),"next_tool":"mcp__weftcut__creator_style_memory","next_arguments":{"action":"context"},"general_write_contract":{"memory_domain":"general","meaning":"YOU confirm this is a non-editing fact; the host does not classify prose."},"ownership":"Hermes chooses interpretation, evidence, scope, or no learning. No preference was created."})
        for operation in operations:
            if not isinstance(operation,dict) or operation.get("action") not in ("add","replace"): continue
            values=[operation.get("content") if operation.get("content") is not None else operation.get("new_text")]
            if any(value in text.lower() for text in values if isinstance(text,str) for value in ids):
                return json.dumps({"success":False,"error":"Canonical creator-style evidence/preference identifiers cannot be persisted in generic memory. Use creator_style_memory for an evidence-linked interpretation, or omit learning. General technical notes should not duplicate creator provenance.","next_tool":"mcp__weftcut__creator_style_memory","next_arguments":{"action":"context"},"ownership":"Hermes chooses the meaning, support and scope, or no learning. No preference was created or general memory changed."})
        return None
    def scoped_memory(args,**kwargs):
        failure=memory_gate(args)
        return failure if failure is not None else original(args,**kwargs)
    def pre_tool_call(tool_name="",args=None,**kwargs):
        if tool_name!="memory": return None
        args=args if isinstance(args,dict) else {}
        failure=memory_gate(args)
        if failure is not None: return {"action":"block","message":failure}
        # The same native fast path omits the advertised single-op new_text
        # alias. Normalize only that existing alias; supplied content wins.
        if not args.get("operations") and args.get("action") in ("add","replace") and args.get("content") is None and isinstance(args.get("new_text"),str):
            return {"action":"modify","args":{"content":args["new_text"]}}
        return None
    # Native Hermes's memory fast path directly calls memory_tool with its
    # session store; it bypasses registry.handler. Its supported pre-tool hook
    # is the authoritative boundary for that path, without replacing dispatch.
    ctx.register_hook("pre_tool_call",pre_tool_call)
    scoped_memory._sclip_original_handler=original
    entry.handler=scoped_memory
    MEMORY_SCHEMA["description"]=DESCRIPTION
    MEMORY_SCHEMA["parameters"]["properties"]["memory_domain"]={"type":"string","enum":["general","creator_style"],"description":"Required for new add/replace writes (including atomic batches). YOU classify purpose: general = non-editing facts, tool conventions or communication. Creator editing preferences/correction interpretations use canonical creator_style_memory instead. Remove does not require this field."}
    entry.description=DESCRIPTION
`

export function stageHermesEditorToolContracts(home:string) {
  const file=path.join(home,'config.yaml'),config=parse(fs.readFileSync(file,'utf8'))??{}
  const plugins=config.plugins??{}
  if(Array.isArray(plugins.disabled)&&plugins.disabled.includes('sclip-editor-tool-contracts'))return false
  const target=path.join(home,'plugins','sclip-editor-tool-contracts')
  fs.mkdirSync(target,{recursive:true,mode:0o700})
  fs.writeFileSync(path.join(target,'plugin.yaml'),'name: sclip-editor-tool-contracts\nversion: 1.0.0\ndescription: Sclip native memory jurisdiction contract\nhooks:\n  - pre_tool_call\n',{mode:0o600})
  fs.writeFileSync(path.join(target,'__init__.py'),HERMES_EDITOR_TOOL_CONTRACT_PLUGIN,{mode:0o600})
  plugins.enabled=[...new Set([...(Array.isArray(plugins.enabled)?plugins.enabled:[]),'sclip-editor-tool-contracts'])]
  config.plugins=plugins
  fs.writeFileSync(`${file}.tool-contracts.tmp`,stringify(config),{mode:0o600});fs.renameSync(`${file}.tool-contracts.tmp`,file)
  return true
}
