"""Offline token proxy and workload arithmetic; not model pricing/inference."""
import json
import os
from pathlib import Path
import socket

root = Path.cwd()
os.environ['TIKTOKEN_CACHE_DIR'] = str(root / '.scratch/phase4c1/tokenizer-cache')
def forbidden(*args, **kwargs):
    raise RuntimeError('Network forbidden; pre-existing tokenizer cache required')
socket.create_connection = forbidden
socket.socket.connect = forbidden
import tiktoken
encoding = tiktoken.get_encoding('o200k_base')
folder = Path(__file__).parent
probe = json.loads((folder/'memory-probe-results.json').read_text())
counts = {name:{'characters':len(text),'o200k_proxy_tokens':len(encoding.encode(text))}
          for name,text in probe['contexts'].items()}
row_bytes = probe['scenarios']['A']['bytes']/600
workloads = []
for videos in [10,100,500,1000]:
    observations=videos*50
    # Unchanged implementation: capacity stops capture; hypothetical uncapped
    # extrapolation is not an observed file size or acceptable solution.
    workloads.append({'videos':videos,'assumed_observations':observations,
        'current_captured_upper_bound':min(600,observations),
        'current_uncaptured_lower_bound':max(0,observations-600),
        'uncapped_linear_bytes_projection':round(observations*row_bytes),
        'planned_initial_context_tokens':videos*900,
        'planned_full_input_replay_16_turns_tokens':videos*900*16,
        'planned_maintenance_tokens_if_every_5_videos':(videos//5)*(1500+600),
        'planned_maintenance_calls_added':0})
result={'model_calls':0,'tokenizer':'o200k_base cached; proxy, not verified Hermes/provider tokenizer',
    'measured_contexts':counts,'assumptions':{
        'observations_per_video':50,'planned_context_tokens':900,
        'replay_turns':16,'optional_foreground_maintenance_every_videos':5,
        'maintenance_input_tokens':1500,'maintenance_output_tokens':600,
        'cost_formula':'input_tokens * actual_input_price_per_million / 1000000 + output_tokens * actual_output_price_per_million / 1000000',
        'illustrative_only_prices':{'input_per_million_usd':1,'output_per_million_usd':5},
        'not_current_provider_quote':True},'workloads':workloads}
(folder/'memory-cost-projection-results.json').write_text(json.dumps(result,indent=2)+'\n')
print(json.dumps(result,indent=2))
