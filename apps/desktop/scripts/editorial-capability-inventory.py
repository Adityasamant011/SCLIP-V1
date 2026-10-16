"""Read-only registry inventory; no inference or optional integration activation."""
import sys,os,pathlib,json,tempfile
bundle=pathlib.Path(sys.argv[1]);out=pathlib.Path(sys.argv[2]);out.mkdir(exist_ok=True)
sys.path.insert(0,str(bundle/'app'))
home=tempfile.TemporaryDirectory(prefix='sclip-tool-inventory-');os.environ['HERMES_HOME']=home.name
for name in list(os.environ):
 if any(s in name for s in ['API_KEY','API_TOKEN','OPENAI_BASE','OPENROUTER_BASE']):os.environ.pop(name,None)
os.environ['PYTHONDONTWRITEBYTECODE']='1'
import model_tools
from tools.registry import registry
active=model_tools.get_tool_definitions(enabled_toolsets=['terminal','file','web','vision','skills','todo','memory','clarify','weftcut'],quiet_mode=True,skip_tool_search_assembly=True)
active_names={x['function']['name'] for x in active};sets=registry.get_available_toolsets();records=[]
for name in registry.get_all_tool_names():
 e=registry.get_entry(name)
 records.append({'name':name,'toolset':registry.get_toolset_for_tool(name),'registered':True,'schema':registry.get_schema(name),'selected_toolset':registry.get_toolset_for_tool(name) in ['terminal','file','web','vision','skills','todo','memory','clarify','weftcut'],'available_without_credentials':name in active_names,'requires_env':list(e.requires_env or []),'check_function':getattr(e.check_fn,'__name__',None)})
(out/'hermes-registry.json').write_text(json.dumps({'registered':records,'toolsets':sets,'active_definitions_without_credentials':active},indent=2))
print(json.dumps({'registered':len(records),'active_without_credentials':len(active_names)}));home.cleanup()
