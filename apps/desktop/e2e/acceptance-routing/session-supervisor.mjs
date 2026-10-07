// Observation/lifecycle only. No idle timeout, clarification answers, restart or
// terminate-on-clarify path. The absolute runner deadline is the only stop rule.
export function superviseSession(child, {deadlineMs, onEvent = () => {}, killGraceMs = 5000}) {
  if (!(deadlineMs > 0)) throw new Error('A positive absolute deadline is required');
  const started = Date.now();
  let waiting = null, sessionId = null, ended = false, deadlineExceeded = false;
  const buffers = new Map();
  function publish(event) { onEvent({...event, runner_elapsed_ms: Date.now() - started}); }
  function observe(line) {
    const prefix = 'SCLIP_ACCEPTANCE_EVENT ';
    const index = line.indexOf(prefix);
    if (index < 0) return;
    let event;
    try { event = JSON.parse(line.slice(index + prefix.length)); } catch { return; }
    if (typeof event.session_id !== 'string') return;
    if (sessionId && sessionId !== event.session_id) {
      publish({event:'session_identity_mismatch', expected:sessionId, received:event.session_id});
      return; // Never spawn another session or derive an early termination.
    }
    sessionId = event.session_id;
    if (event.event === 'clarify_waiting' && Number.isFinite(event.effective_timeout_s)) {
      waiting = {...event, observedAt: Date.now()};
      publish({...event, action:'WAIT_FOR_EXISTING_CALLBACK',
        remaining_runner_ms: Math.max(0, deadlineMs - (Date.now() - started))});
    } else if (event.event === 'clarify_returned') {
      waiting = null;
      publish({...event, action:'CONTINUE_SAME_SESSION'});
    }
  }
  function stream(stream) {
    if (!stream) return;
    buffers.set(stream,'');
    stream.on('data', chunk => {
      let pending = buffers.get(stream) + String(chunk);
      let newline;
      while ((newline = pending.indexOf('\n')) >= 0) {
        observe(pending.slice(0,newline));pending = pending.slice(newline+1);
      }
      buffers.set(stream,pending);
    });
  }
  stream(child.stdout);stream(child.stderr);
  let force;
  const deadline = setTimeout(() => {
    if (ended) return;
    deadlineExceeded = true;
    publish({event:'runner_deadline', waiting_for_clarify:!!waiting, session_id:sessionId});
    child.kill('SIGTERM');
    force = setTimeout(() => { if (!ended) child.kill('SIGKILL'); }, killGraceMs);
  }, deadlineMs);
  const done = new Promise((resolve,reject) => {
    child.once('error', error => {clearTimeout(deadline);clearTimeout(force);ended=true;reject(error);});
    child.once('close',(code,signal) => {
      ended=true;clearTimeout(deadline);clearTimeout(force);
      for (const tail of buffers.values()) observe(tail);
      resolve({code,signal,deadline_exceeded:deadlineExceeded,session_id:sessionId,session_count:1});
    });
  });
  return {done, status:() => ({phase:waiting?'WAITING_FOR_CLARIFY':'RUNNING',
    session_id:sessionId, effective_clarify_timeout_s:waiting?.effective_timeout_s ?? null,
    elapsed_s:Math.round((Date.now()-started)/1000),
    remaining_runner_s:Math.max(0,Math.round((deadlineMs-(Date.now()-started))/1000))})};
}
