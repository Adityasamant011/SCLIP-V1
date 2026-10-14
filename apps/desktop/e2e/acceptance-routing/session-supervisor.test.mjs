import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {superviseSession} from './session-supervisor.mjs';

function fake(recover=true, ignoreTermination=false) {
 const code=`
 const timeoutMs=80, session_id='one-fake-session';
 ${ignoreTermination ? "process.on('SIGTERM',()=>{});" : ''}
 const event=e=>process.stdout.write('SCLIP_ACCEPTANCE_EVENT '+JSON.stringify({...e,session_id})+'\\n');
 console.log('SCLIP_FIXTURE_READY');
 process.stdin.once('data',()=>{
 event({event:'clarify_waiting',effective_timeout_s:timeoutMs/1000});
 ${recover ? `setTimeout(()=>{
  event({event:'clarify_returned',effective_timeout_s:timeoutMs/1000,outcome:'returned'});
  console.log(JSON.stringify({event:'fake_tool_action',session_id}));
  console.log(JSON.stringify({event:'final_result',session_id,success:true}));
 },timeoutMs);` : 'setInterval(()=>{},1000);'}
 });
 `;
 const child=spawn(process.execPath,['-e',code]);
 const kills=[];const kill=child.kill.bind(child);child.kill=signal=>{kills.push(signal);return kill(signal);};
 let output='';let readyResolve;
 const ready=new Promise((resolve,reject)=>{readyResolve=resolve;child.once('error',reject);});
 child.stdout.on('data',c=>{output+=c;if(output.includes('SCLIP_FIXTURE_READY'))readyResolve();});
 return {child,kills,ready,start:()=>child.stdin.end('START\n'),output:()=>output};
}
test('clarify expires naturally, fake tool acts, same session finishes without early kill',{timeout:3000},async()=>{
 let spawns=0;const f=(()=>{spawns++;return fake();})();const events=[];
 await f.ready;
 const s=superviseSession(f.child,{deadlineMs:1500,onEvent:e=>events.push(e)});
 f.start();
 const result=await s.done;
 assert.equal(spawns,1);assert.deepEqual(f.kills,[]);assert.equal(result.code,0);
 assert.equal(result.session_count,1);assert.equal(result.session_id,'one-fake-session');assert.equal(result.deadline_exceeded,false);
 assert.equal(events[0].effective_timeout_s,0.08);assert.equal(events[0].action,'WAIT_FOR_EXISTING_CALLBACK');
 assert.equal(events[1].action,'CONTINUE_SAME_SESSION');
 const ordinary=f.output().split('\n').filter(x=>x.startsWith('{')).map(x=>JSON.parse(x));
 assert.equal(ordinary[0].event,'fake_tool_action');assert.equal(ordinary[1].event,'final_result');assert.equal(ordinary[1].success,true);
});
test('clarify with no recovery ends only at the overall deadline',{timeout:3000},async()=>{
 const f=fake(false);const events=[];
 await f.ready;
 const s=superviseSession(f.child,{deadlineMs:300,onEvent:e=>events.push(e),killGraceMs:50});
 f.start();
 const result=await s.done;
 assert.equal(events[0].effective_timeout_s,0.08);
 assert.equal(events.at(-1).event,'runner_deadline');assert(events.at(-1).runner_elapsed_ms>=280);
 assert.equal(result.deadline_exceeded,true);assert.equal(result.session_count,1);
 assert.deepEqual(f.kills,['SIGTERM']);
});
test('overall deadline remains bounded when child ignores SIGTERM',{timeout:3000},async()=>{
 const f=fake(false,true);
 await f.ready;
 const supervisor=superviseSession(f.child,{deadlineMs:300,killGraceMs:50});f.start();
 const result=await supervisor.done;
 assert.equal(result.deadline_exceeded,true);assert.equal(result.signal,'SIGKILL');
 assert.deepEqual(f.kills,['SIGTERM','SIGKILL']);
});
