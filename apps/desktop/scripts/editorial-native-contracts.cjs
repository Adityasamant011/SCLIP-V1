// Private, pure native contracts from the frozen addon. Never a timeline writer.
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),assert=require('node:assert/strict');
const out=process.argv[2],addon=process.argv[3];fs.mkdirSync(out,{recursive:true});const temp=fs.mkdtempSync(path.join(os.tmpdir(),'sclip-native-contract-'));const {Backend}=require(addon);const b=new Backend(path.join(temp,'config'),path.join(temp,'cache'),()=>{});const results=[];
async function check(name,args,verify){const value=await b[name](...args);verify(value);results.push({name,args,result:value,status:'PASS',scope:'direct pure native contract; not a Hermes creative outcome'})}
(async()=>{try{
fs.writeFileSync(path.join(out,'prototype.json'),JSON.stringify(Object.getOwnPropertyNames(Backend.prototype),null,2));
for(const text of ['First independent cue','Second independent cue','Third independent cue'])await check('parseSubtitles',[`1\n00:00:00,000 --> 00:00:01,000\n${text}\n`, 'srt'],v=>{const d=JSON.parse(v);assert.equal(d.cues.length,1);assert.equal(d.cues[0].text,text)});
await check('mcpCallTool',['ping','{}'],v=>assert(v.includes('pong')));
await check('mcpCatalog',[],v=>assert(JSON.parse(v).some?.(x=>x.name==='ping')||v.includes('ping')));
await check('mcpListPrompts',[],v=>assert(JSON.parse(v)));
fs.writeFileSync(path.join(out,'results.json'),JSON.stringify(results,null,2));console.log(JSON.stringify({passed:results.length}));
}catch(e){fs.writeFileSync(path.join(out,'failure.json'),JSON.stringify({error:String(e),results},null,2));throw e}finally{fs.rmSync(temp,{recursive:true,force:true})}})().then(()=>process.exit(0),()=>process.exit(1));
