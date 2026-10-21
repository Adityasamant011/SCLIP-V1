export function recoveryPage(env) {
  const nonce = crypto.randomUUID().replaceAll('-','')
  const config = JSON.stringify({ url:env.SUPABASE_URL,key:env.SUPABASE_ANON_KEY }).replaceAll('<','\\u003c')
  return new Response(`<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Reset your Sclip password</title>
<body><main><h1>Reset your Sclip password</h1><form><label>New password <input type="password" name="password" autocomplete="new-password" minlength="8" maxlength="256" required></label><button>Save password</button></form><p role="status"></p></main>
<script nonce="${nonce}">
const cfg=${config}; const tokens=new URLSearchParams(location.hash.slice(1)); const token=tokens.get('access_token'); history.replaceState(null,'',location.pathname);
const form=document.querySelector('form'); const status=document.querySelector('[role=status]');
if(!token){form.hidden=true;status.textContent='This link is missing or expired. Request a new reset email in Sclip.';}
form.addEventListener('submit',async e=>{e.preventDefault();const button=form.querySelector('button');button.disabled=true;status.textContent='Saving…';
try{const response=await fetch(cfg.url+'/auth/v1/user',{method:'PUT',headers:{apikey:cfg.key,Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify({password:form.elements.password.value})});
form.elements.password.value='';if(!response.ok)throw Error();form.hidden=true;status.textContent='Password saved. Return to Sclip and sign in.';
}catch{status.textContent='Could not save the password. Request a new reset link if this one expired.';}finally{button.disabled=false;}});
</script></body></html>`,{ headers:{ 'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store','Referrer-Policy':'no-referrer',
    'Content-Security-Policy':`default-src 'none'; script-src 'nonce-${nonce}'; connect-src ${new URL(env.SUPABASE_URL).origin}; form-action 'none'; base-uri 'none'; frame-ancestors 'none'` } })
}
