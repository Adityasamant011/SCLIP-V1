"""Conservative evidence index; execution is not automatically certification."""
import csv,json,pathlib,collections
ROOT=pathlib.Path(__file__).resolve().parents[3]
E=ROOT/'acceptance-artifacts/editorial-intelligence-v1';D=ROOT/'docs/editorial'
seen={};native=[];runs=[];call_names={}
for p in sorted(E.rglob('actual-native-tool-records.json')):
 for x in json.loads(p.read_text()):
  if x.get('call'):call_names[x['call'].get('id')]=x['call'].get('function',{}).get('name')
  if x.get('role')=='tool':
   key=x.get('tool_call_id') or (str(p),x.get('tool'),x.get('result'))
   seen.setdefault(key,(x,str(p.relative_to(E))))
for p in sorted(E.rglob('native-outcome.json')):
 j=json.loads(p.read_text());usage=p.parent/'provider-usage.jsonl';u=[json.loads(x) for x in usage.read_text().splitlines()] if usage.exists() else []
 runs.append({'case':str(p.parent.relative_to(E)),'requests':j['requests'],'seconds':j.get('elapsed_s'),'status':j['disposition']['status'],'readiness':j['disposition'].get('readiness'),'reported_cost':sum((x.get('usage') or {}).get('cost',0) for x in u),'missing_usage':sum(x.get('usage') is None for x in u),'usage_receipts':len(u),'output_decoded':(p.parent/'decode.json').exists() and json.loads((p.parent/'decode.json').read_text())['status']==0})
(E/'reliability-results.json').write_text(json.dumps(runs,indent=2))
proof=collections.defaultdict(list)
for x,p in seen.values():
 n=x.get('tool') or call_names.get(x.get('tool_call_id'));
 if not n:continue
 s=x.get('result','');bad='"isError": true' in s or '"success": false' in s or s.startswith('Error')
 proof[n.removeprefix('mcp__weftcut__')].append({'evidence':p,'tool_call_id':x.get('tool_call_id'),'response_error_detected':bad})
# Strong observed scopes validated against actual projects/decoded output.
verified={'ping':'Direct native pong','add_video_layer':'Actual paired selections in A/B/C and saved/reopened projects','add_text_layer':'Native labels in independent style projects and current explicit56px override','update_layer_params':'Actual ProjectActor corrections48/36/48→28; persisted', 'get_audio_understanding_status':'Missing→ready plus real local inference','list_speech_voices':'Catalog followed by actual three aliases','synthesize_speech':'Placed generated assets, cancellation60s, recovery and two concurrent requests','inspect_rendered_audio':'Current rendered mix, Whisper and SenseVoice observations; accuracy scoped separately','creator_style_memory':'Native context retrieval with correct provenance; positive learning fails','get_composition':'Returned actual authored composition; checked against saved state','get_editorial_evidence_packet':'Actual current source/layer coordinate packet; not subjective QA','get_review_feedback':'Actual legal progression/current review stage; not completion-rate proof'}
for domain,file in [('mcp','mcp-current-matrix.json'),('hermes','hermes-current-matrix.json')]:
 rows=json.loads((E/'capabilities'/file).read_text())
 for r in rows:
  n=r['name'];ps=proof.get(n,[]);r['evidence']=ps
  r['registered']=True
  if ps:
   r['callable']=True;r['functional']=None;r['end_to_end']=None;r['status']='PARTIAL';r['reason']='Actual native invocation/result retained; expected behavior and broader failure recovery not universally certified'
  if domain=='mcp' and n in verified and (ps or n in ['ping','update_layer_params','synthesize_speech','inspect_rendered_audio','get_audio_understanding_status','list_speech_voices']):
   r['functional']=True;r['status']='PASS';r['reason']=verified[n]+'; bounded mechanical scope only';r['end_to_end']=bool(ps)
  if n in ['add_motif','write_motif_draft','install_motif'] and ps:
   r['status']='PARTIAL';r['reason']='Callable; style4 malformed draft was admitted/installed but failed render (no motif.define); not robust autonomous outcome'
  if domain=='hermes' and n in ['terminal','write_file','read_file','patch','process','memory','skills_list','skill_view','todo','tool_search','tool_describe','tool_call'] and ps:
   r['status']='PASS';r['functional']=True;r['end_to_end']=True;r['reason']='Actual native result checked in capability control or independent native projects; bounded invocation scope'
   if n in ['terminal','write_file','patch']:
    r['status']='PARTIAL';r['reason']='Actual operation works, but packaged cwd ignored disposable terminal configuration; test-only package addition preserved/restored'
   if n=='memory':r['reason']='General communication memory write succeeded; canonical style preference creation/transfer not credited'
  if domain=='hermes' and n in ['web_search','web_extract','browser_navigate','browser_snapshot','browser_click','browser_type','browser_scroll']:
   r['status']='BLOCKED';r['callable']=False;r['functional']=None;r['end_to_end']=False;r['reason']='Not in native active schema. Web provider credentials/gateway absent; browser CLI/runtime/config absent. Terminal curl in control is not browser proof.'
  r.pop('schema',None);r.pop('description',None)
 (E/'capabilities'/file).write_text(json.dumps(rows,indent=2))
 with (D/f'EI_V1_{domain.upper()}_CAPABILITY_MATRIX.csv').open('w',newline='') as f:
  w=csv.DictWriter(f,fieldnames=['name','status','registered','callable','functional','end_to_end','reason','evidence']);w.writeheader()
  for r in rows:w.writerow({k:json.dumps(r.get(k)) if k=='evidence' else r.get(k) for k in w.fieldnames})
rows=json.loads((E/'capabilities/native-current-matrix.json').read_text())
for r in rows:
 name=r['name'];r['registered']=True;r['functional']=None;r['callable']=None;r['end_to_end']=False
 r['reason']='Historical inventory retained; deleted historical raw evidence does not establish current real-runtime functionality'
 r['evidence']=[]
 if name in ['parseSubtitles','mcpCallTool','mcpCatalog','mcpListPrompts']:
  r['status']='PASS';r['functional']=True;r['callable']=True;r['reason']='Current direct loaded frozen-addon pure contract; not Hermes end-to-end outcome';r['evidence']=['capabilities/native-contracts/results.json']
for r in rows:
 for k in ['test_arguments_response','individual_calls']:r.pop(k,None)
(E/'capabilities/native-current-matrix.json').write_text(json.dumps(rows,indent=2))
with (D/'EI_V1_NATIVE_CAPABILITY_MATRIX.csv').open('w',newline='') as f:
 w=csv.DictWriter(f,fieldnames=['id','name','category','status','registered','callable','functional','end_to_end','reason','evidence']);w.writeheader()
 for r in rows:w.writerow({k:json.dumps(r.get(k)) if k=='evidence' else r.get(k) for k in w.fieldnames})
print('Indexed',len(seen),'unique results;',len(runs),'native runs; matrices',len(rows), 'native /118 MCP /101 Hermes')
