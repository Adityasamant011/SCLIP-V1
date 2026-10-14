import {it, expect} from 'vitest'
import {spawnSync} from 'node:child_process'
import {fileURLToPath} from 'node:url'

it('disables native telemetry before Kokoro imports and preserves voice/audio provenance', () => {
  const worker = fileURLToPath(new URL('../../vision/sidecar/kokoro_tts_worker.py', import.meta.url))
  const script = String.raw`
import os,sys,tempfile,pathlib,types,builtins,runpy,json,contextlib,io
with tempfile.TemporaryDirectory() as directory:
    os.environ['HOME']=directory
    os.environ['ORT_DISABLE_TELEMETRY']='0'
    root=pathlib.Path(directory)
    for name in ['model.onnx','voices.bin']:(root/name).write_bytes(b'fixture'*500)
    original=builtins.__import__
    def imports(name,*args,**kwargs):
        if name=='kokoro_onnx':
            assert os.environ.get('ORT_DISABLE_TELEMETRY')=='1', 'telemetry enabled at native import'
        return original(name,*args,**kwargs)
    builtins.__import__=imports
    class Kokoro:
        def __init__(self,model,voices):
            assert model==str(root/'model.onnx') and voices==str(root/'voices.bin')
        def get_voices(self):return ['am_michael','bf_emma']
        def create(self,**args):
            assert args==dict(text='A complete synthetic sentence.',voice='am_michael',speed=1.25,lang='en-us')
            return [0.0,0.2,0.0],24000
    sys.modules['kokoro_onnx']=types.SimpleNamespace(Kokoro=Kokoro)
    sys.modules['soundfile']=types.SimpleNamespace(write=lambda file,samples,rate:pathlib.Path(file).write_bytes(b'fixture audio'*100))
    sys.argv=[sys.argv[1],'--model',str(root/'model.onnx'),'--voices',str(root/'voices.bin'),'--text','A complete synthetic sentence.','--voice','onyx','--speed','1.25','--output',str(root/'speech.wav')]
    capture=io.StringIO()
    try:
        with contextlib.redirect_stdout(capture):runpy.run_path(sys.argv[0],run_name='__main__')
    except SystemExit as error:assert error.code==0
    result=json.loads(capture.getvalue())
    assert result['resolved_voice']=='am_michael' and result['requested_voice']=='onyx'
    assert result['language']=='en-us' and result['sample_rate']==24000
    assert (root/'speech.wav').stat().st_size>100
    print('native import guarded; requested synthesis unchanged')
`
  const result=spawnSync('python3',['-B','-c',script,worker],{encoding:'utf8',timeout:10_000})
  expect(result.error).toBeUndefined()
  expect(result.status, result.stderr).toBe(0)
  expect(result.stdout).toContain('native import guarded')
})

it('refuses missing or undersized explicit model files without substituting defaults or downloading',()=>{
 const worker=fileURLToPath(new URL('../../vision/sidecar/kokoro_tts_worker.py',import.meta.url))
 const script=String.raw`
import os,sys,pathlib,tempfile,runpy,urllib.request
with tempfile.TemporaryDirectory() as directory:
    os.environ['HOME']=directory
    root=pathlib.Path(directory)
    defaults=root/'Library'/'Application Support'/'Sclip'/'models'/'kokoro'
    defaults.mkdir(parents=True)
    for name in ['kokoro-v1.0.int8.onnx','voices-v1.0.bin']:(defaults/name).write_bytes(b'fixture'*500)
    def forbidden(*args,**kwargs):raise AssertionError('unexpected automatic download')
    urllib.request.urlretrieve=forbidden
    ensure=runpy.run_path(sys.argv[1],run_name='fixture')['ensure_model_files']
    tiny=root/'corrupt.onnx';tiny.write_bytes(b'bad')
    for path in [root/'missing.onnx',tiny]:
        try:ensure(str(path),str(defaults/'voices-v1.0.bin'))
        except (FileNotFoundError,ValueError) as error:assert str(path) in str(error)
        else:raise AssertionError('explicit model silently substituted')
    try:ensure(str(defaults/'kokoro-v1.0.int8.onnx'),str(root/'missing-voices.bin'))
    except FileNotFoundError as error:assert 'missing-voices.bin' in str(error)
    else:raise AssertionError('explicit voices silently substituted')
    assert ensure(str(defaults/'kokoro-v1.0.int8.onnx'),str(defaults/'voices-v1.0.bin'))==tuple(str(defaults/name) for name in ['kokoro-v1.0.int8.onnx','voices-v1.0.bin'])
    print('explicit paths preserved; corrupt files refused without download')
`
 const result=spawnSync('python3',['-B','-c',script,worker],{encoding:'utf8',timeout:10_000})
 expect(result.status,result.stderr).toBe(0)
 expect(result.stdout).toContain('explicit paths preserved')
})
