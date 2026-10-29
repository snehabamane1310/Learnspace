import React,{useCallback,useEffect,useRef,useState} from 'react';
import {Award,Code2,Play,Send,ShieldAlert,Timer} from 'lucide-react';
import {api,err} from './api.js';

export default function CodingTest({enrollmentId,lesson,unlocked,onPassed}){
  const [data,setData]=useState(null),[attempt,setAttempt]=useState(null),[code,setCode]=useState(''),[output,setOutput]=useState(''),[result,setResult]=useState(null),[busy,setBusy]=useState(false),[error,setError]=useState('');
  const done=useRef(false);
  const url='/enrollments/'+enrollmentId+'/lessons/'+lesson._id+'/challenge';
  const refresh=useCallback(()=>api.get(url).then(r=>setData(r.data)).catch(x=>setError(err(x))),[url]);
  useEffect(()=>{if(unlocked)refresh()},[unlocked,refresh]);
  useEffect(()=>()=>{if(document.fullscreenElement)document.exitFullscreen().catch(()=>{})},[]);

  const endViolation=useCallback(async(type)=>{
    if(!attempt||done.current)return;
    done.current=true;
    try{await api.post('/code-attempts/'+attempt.attemptId+'/violation',{type})}catch{}
    setAttempt(null);setResult({score:0,total:0,percent:0,passed:false,violated:true});setError('This attempt ended because you left the coding test. Start a new attempt to try again.');
    if(document.fullscreenElement)document.exitFullscreen().catch(()=>{});
  },[attempt]);
  useEffect(()=>{
    if(!attempt)return;
    const vis=()=>{if(document.hidden)endViolation('tab_switch')};
    const blur=()=>setTimeout(()=>{if(!document.hasFocus())endViolation('window_blur')},250);
    const fs=()=>{if(!document.fullscreenElement)endViolation('fullscreen_exit')};
    const stop=e=>e.preventDefault();
    const key=e=>{if(((e.ctrlKey||e.metaKey)&&['c','v','x','a'].includes(e.key.toLowerCase()))||(e.shiftKey&&e.key==='Insert'))e.preventDefault()};
    document.addEventListener('visibilitychange',vis);window.addEventListener('blur',blur);document.addEventListener('fullscreenchange',fs);
    ['copy','cut','paste','contextmenu','dragstart','drop'].forEach(t=>document.addEventListener(t,stop));document.addEventListener('keydown',key);
    return()=>{document.removeEventListener('visibilitychange',vis);window.removeEventListener('blur',blur);document.removeEventListener('fullscreenchange',fs);['copy','cut','paste','contextmenu','dragstart','drop'].forEach(t=>document.removeEventListener(t,stop));document.removeEventListener('keydown',key)};
  },[attempt,endViolation]);

  async function start(){
    setBusy(true);setError('');setResult(null);
    try{
      if(!document.fullscreenElement){if(!document.documentElement.requestFullscreen)throw new Error('Fullscreen is not available in this browser.');await document.documentElement.requestFullscreen()}
      const {data:d}=await api.post(url+'/start');
      setAttempt(d);setCode(d.challenge.starterCode||'');setOutput('');done.current=false;
    }catch(x){setError(x.response?err(x):x.message||'Could not start the coding test.')}
    finally{setBusy(false)}
  }
  async function runCode(){
    if(!attempt)return;setBusy(true);setError('');
    try{const {data:d}=await api.post('/code-attempts/'+attempt.attemptId+'/run',{code});setOutput(d.ok?d.output||'(No output)':d.error||d.output||'The program did not run.')}
    catch(x){setError(err(x))}finally{setBusy(false)}
  }
  async function submit(){
    if(!attempt||done.current)return;setBusy(true);setError('');
    try{const {data:d}=await api.post('/code-attempts/'+attempt.attemptId+'/submit',{code});done.current=true;setResult(d);setAttempt(null);if(d.passed)onPassed?.();refresh();if(document.fullscreenElement)document.exitFullscreen().catch(()=>{})}
    catch(x){setError(err(x))}finally{setBusy(false)}
  }
  if(!unlocked)return <section className="codetest locked"><div><Code2/><b>Video coding test</b><span>Watch 75% of this video to unlock its coding test.</span></div></section>;
  if(!data)return <section className="codetest"><b>Loading coding test…</b>{error&&<div className="notice">{error}</div>}</section>;
  const c=data.challenge;
  return <section className="codetest" onContextMenu={e=>e.preventDefault()}>
    <header><div><small>AFTER THIS VIDEO</small><h2><Code2 size={20}/>{c.title}</h2></div><span>{c.language.toUpperCase()} · compiler test</span></header>
    <p className="codeprompt">{c.prompt}</p>
    {data.best&&<div className="codetest-best">Best score: <b>{data.best.score}/{data.best.total}</b>{data.passed?' · Passed':''}</div>}
    {error&&<div className="notice"><b>!</b>{error}</div>}
    {result&&<div className={'coderesult '+(result.passed?'pass':'fail')}><b>{result.violated?'Attempt ended':result.passed?'Passed!':'Score: '+result.score+' / '+result.total}</b>{!result.violated&&<span>{result.percent}% · {result.passed?'You can continue to the next video.':'Review your code and try again.'}</span>}{result.results&&<small>{result.results.filter(x=>x.passed).length} of {result.total} tests passed</small>}</div>}
    {!attempt&&!data.passed&&<button className="btn" disabled={busy} onClick={start}><ShieldAlert size={16}/>{busy?'Starting…':'Start coding test'}</button>}
    {data.passed&&!attempt&&<div className="codesuccess"><Award/> Coding test passed. You can continue to the next video.</div>}
    {attempt&&<div className="codeexam">
      <div className="codeeditor-head"><span>{c.language}</span><span>Paste and tab switching are disabled during this test</span></div>
      <textarea className="codeeditor" value={code} spellCheck="false" autoCapitalize="off" autoCorrect="off" onChange={e=>setCode(e.target.value)}
        onPaste={e=>e.preventDefault()} onCopy={e=>e.preventDefault()} onCut={e=>e.preventDefault()} onDrop={e=>e.preventDefault()}
        onKeyDown={e=>{if(e.key==='Tab'){e.preventDefault();const a=e.target.selectionStart,b=e.target.selectionEnd,v=e.target.value;setCode(v.slice(0,a)+'  '+v.slice(b));requestAnimationFrame(()=>{e.target.selectionStart=e.target.selectionEnd=a+2})}}}/>
      <div className="codeactions"><button className="btn secondary" disabled={busy} onClick={runCode}><Play size={15}/>{busy?'Running…':'Run sample'}</button><button className="btn" disabled={busy} onClick={submit}><Send size={15}/>{busy?'Submitting…':'Submit test'}</button></div>
      {output&&<pre className="codeoutput">{output}</pre>}
    </div>}
    <small className="codefoot">Your score appears after submission. Passing unlocks the next lesson. Leaving this tab or fullscreen ends the attempt.</small>
  </section>;
}
