import React,{useCallback,useEffect,useRef,useState} from 'react';
import {Link,useNavigate,useParams} from 'react-router-dom';
import {ArrowRight,Award,Check,ClipboardList,ShieldAlert,Timer} from 'lucide-react';
import {api,err} from './api.js';

const fs=()=>document.documentElement;
const enterFs=async()=>{try{if(document.fullscreenElement)return true;if(!fs().requestFullscreen)return false;await fs().requestFullscreen();return !!document.fullscreenElement}catch{return false}};
const exitFs=()=>{try{if(document.fullscreenElement)document.exitFullscreen()}catch{}};
const mmss=s=>`${Math.floor(s/60)}:${String(s%60).padStart(2,'0')}`;

export default function QuizPage({user}){
  const {id}=useParams();
  const [m,setM]=useState(null),[error,setError]=useState(''),[session,setSession]=useState(null),[result,setResult]=useState(null),[busy,setBusy]=useState(false);

  const load=useCallback(()=>{
    api.get(`/courses/${id}/milestones`).then(r=>setM(r.data)).catch(x=>setError(err(x)));
  },[id]);
  useEffect(()=>{if(!user){setError('Sign in to take the quiz.');return}load()},[user,load]);
  useEffect(()=>()=>exitFs(),[]);

  async function start(){
    setBusy(true);setError('');
    const fullscreen=await enterFs(); // must be triggered by this click
    if(!fullscreen){setError('Fullscreen is required to take this quiz. Allow fullscreen access and try again.');setBusy(false);return}
    try{const {data}=await api.post(`/courses/${id}/quiz/start`);setSession(data)}
    catch(x){setError(err(x));exitFs()}finally{setBusy(false)}
  }
  const finish=res=>{setSession(null);setResult(res);exitFs();load()};

  if(session)return <QuizRunner session={session} onFinish={finish}/>;
  if(result)return <ResultView result={result} m={m} courseId={id} onRetry={()=>setResult(null)}/>;
  if(error&&!m)return <main className="page wrap"><div className="notice"><b>!</b>{error}</div><Link className="textlink" to={`/learn/${id}`}>Back to course →</Link></main>;
  if(!m)return <main className="page wrap">Loading quiz...</main>;

  const q=m.quiz;
  const left=q.maxAttempts?Math.max(0,q.maxAttempts-q.attemptsUsed):null;
  const blocked=!q.exists?'This course has no quiz yet.':!q.unlocked?`Finish all lessons to unlock the quiz (you are at ${m.progress}%).`:q.passed?'You have already passed this quiz.':left===0?'You have used all your attempts.':'';

  return <main className="page wrap quizintro">
    <div className="intro"><small>FINAL QUIZ</small><h1>{q.title}</h1><p>Show what you have learned. Read the rules before you begin.</p></div>
    {error&&<div className="notice"><b>!</b>{error}</div>}
    <div className="quizrules">
      <div className="rulegrid">
        <div><ClipboardList/><b>{q.questionCount}</b><span>questions</span></div>
        <div><Timer/><b>{q.timeLimitMinutes} min</b><span>time limit</span></div>
        <div><Check/><b>{q.passPercent}%</b><span>to pass</span></div>
        <div><Award/><b>{left===null?'∞':left}</b><span>{left===1?'attempt left':'attempts left'}</span></div>
      </div>
      <h3><ShieldAlert size={17}/> Exam rules</h3>
      <ul>
        <li>The quiz opens in <b>full screen</b>. Stay in it until you submit.</li>
        <li><b>Do not switch tabs or windows</b>, and do not leave full screen.</li>
        <li>Switching tabs, windows, or leaving fullscreen ends your attempt and counts as <b>failed</b>.</li>
        <li>Copy, paste and right-click are disabled. The timer cannot be paused.</li>
        <li>If time runs out, the quiz is submitted automatically.</li>
      </ul>
      {blocked
        ?<div className="notice"><b>!</b>{blocked}</div>
        :<button className="btn" disabled={busy} onClick={start}>{busy?'Starting...':'I understand — start the quiz'} <ArrowRight size={15}/></button>}
      <div><Link className="textlink" to={`/learn/${id}`}>← Back to course</Link></div>
    </div>
  </main>;
}

function QuizRunner({session,onFinish}){
  const {attemptId,questions,maxViolations}=session;
  const [answers,setAnswers]=useState({}),[idx,setIdx]=useState(0),[violations,setViolations]=useState(session.violations||0);
  const [blocked,setBlocked]=useState(null),[confirm,setConfirm]=useState(false),[left,setLeft]=useState(0),[busy,setBusy]=useState(false);
  const finished=useRef(false),lastV=useRef(0),ans=useRef({}),offset=useRef(session.serverNow-Date.now());
  const fsRequired=useRef(!!document.fullscreenElement);
  ans.current=answers;

  const submit=useCallback(async()=>{
    if(finished.current)return;
    finished.current=true;setBusy(true);setConfirm(false);
    try{
      const {data}=await api.post(`/quiz/attempts/${attemptId}/submit`,{answers:questions.map(q=>({questionId:q.id,choice:ans.current[q.id]??-1}))});
      onFinish(data.result);
    }catch(x){
      const r=x.response?.data?.result;
      if(r)onFinish(r);
      else{finished.current=false;setBusy(false);setBlocked({msg:err(x),retry:true})}
    }
  },[attemptId]);

  const violate=useCallback(async(type)=>{
    if(finished.current)return;
    const now=Date.now();
    if(now-lastV.current<2000)return; // blur + visibilitychange fire together; count once
    lastV.current=now;
    try{
      const {data}=await api.post(`/quiz/attempts/${attemptId}/violation`,{type});
      setViolations(data.violations);
      if(data.terminated||data.finished){finished.current=true;onFinish(data.result||{status:'terminated',endReason:'violations',passed:false,percent:0});return}
      const more=data.maxViolations-data.violations;
      setBlocked({msg:`Warning ${data.violations} of ${data.maxViolations-1}: leaving the quiz window is not allowed. ${more===1?'One more time':more+' more times'} and this attempt ends and counts as failed.`});
    }catch{setBlocked({msg:'You left the quiz window. Please stay on this page until you submit.'})}
  },[attemptId]);

  // countdown, driven by the server's clock
  useEffect(()=>{
    const tick=()=>{
      const rem=Math.max(0,Math.round((session.expiresAt-(Date.now()+offset.current))/1000));
      setLeft(rem);
      if(rem<=0)submit();
    };
    tick();const iv=setInterval(tick,1000);return()=>clearInterval(iv);
  },[]);

  // proctoring listeners
  useEffect(()=>{
    const onVis=()=>{if(document.hidden)violate('tab_switch')};
    const onBlur=()=>setTimeout(()=>{if(!document.hasFocus()&&!finished.current)violate('window_blur')},300);
    const onFs=()=>{if(fsRequired.current&&!document.fullscreenElement&&!finished.current)violate('fullscreen_exit')};
    const stop=e=>e.preventDefault();
    const onKey=e=>{if((e.ctrlKey||e.metaKey)&&['c','v','x','a','p','s','u'].includes(e.key.toLowerCase()))e.preventDefault()};
    const onUnload=e=>{if(finished.current)return;e.preventDefault();e.returnValue=''};
    document.addEventListener('visibilitychange',onVis);
    window.addEventListener('blur',onBlur);
    document.addEventListener('fullscreenchange',onFs);
    ['copy','cut','paste','contextmenu','dragstart'].forEach(t=>document.addEventListener(t,stop));
    document.addEventListener('keydown',onKey);
    window.addEventListener('beforeunload',onUnload);
    return()=>{
      document.removeEventListener('visibilitychange',onVis);
      window.removeEventListener('blur',onBlur);
      document.removeEventListener('fullscreenchange',onFs);
      ['copy','cut','paste','contextmenu','dragstart'].forEach(t=>document.removeEventListener(t,stop));
      document.removeEventListener('keydown',onKey);
      window.removeEventListener('beforeunload',onUnload);
    };
  },[violate]);

  const resume=async()=>{
    if(fsRequired.current&&!document.fullscreenElement)await enterFs();
    if(blocked?.retry)return submit();
    setBlocked(null);
  };

  const q=questions[idx];
  const answered=Object.keys(answers).length;
  return <main className="quizrun" onContextMenu={e=>e.preventDefault()}>
    <div className="qtop">
      <div><small>{session.title}</small><b>Question {idx+1} of {questions.length}</b></div>
      <div className="qwarn"><ShieldAlert size={15}/> Tab switches {violations}/{maxViolations}</div>
      <div className={'qtimer '+(left<=60?'low':'')}><Timer size={16}/> {mmss(left)}</div>
    </div>

    <div className={'qbody '+(blocked?'qhidden':'')}>
      <div className="qpalette">{questions.map((x,j)=>
        <button key={x.id} className={(j===idx?'cur ':'')+(answers[x.id]!==undefined?'done':'')} onClick={()=>setIdx(j)}>{j+1}</button>)}
      </div>
      <h2 className="qtext">{q.text}</h2>
      <div className="qopts">{q.options.map((o,oi)=>
        <button key={oi} className={'qopt2 '+(answers[q.id]===oi?'sel':'')} onClick={()=>setAnswers({...answers,[q.id]:oi})}>
          <span>{String.fromCharCode(65+oi)}</span>{o}
        </button>)}
      </div>
      <div className="qnav">
        <button className="btn secondary" disabled={idx===0} onClick={()=>setIdx(idx-1)}>Previous</button>
        {idx<questions.length-1
          ?<button className="btn" onClick={()=>setIdx(idx+1)}>Next <ArrowRight size={15}/></button>
          :<button className="btn" disabled={busy} onClick={()=>setConfirm(true)}>Review & submit</button>}
      </div>
      {confirm&&<div className="qconfirm">
        <b>Submit your quiz?</b>
        <span>{answered} of {questions.length} answered{answered<questions.length?` — ${questions.length-answered} unanswered will count as wrong`:''}.</span>
        <div><button className="btn secondary small" onClick={()=>setConfirm(false)}>Keep working</button><button className="btn small" disabled={busy} onClick={submit}>{busy?'Submitting...':'Submit now'}</button></div>
      </div>}
      {!confirm&&idx<questions.length-1&&answered===questions.length&&<button className="btn secondary small qsubmitlink" onClick={()=>setConfirm(true)}>All answered — review & submit</button>}
    </div>

    {blocked&&<div className="proctor"><div>
      <ShieldAlert size={34}/>
      <h2>{blocked.retry?'Could not submit':'Quiz paused'}</h2>
      <p>{blocked.msg}</p>
      <button className="btn" onClick={resume}>{blocked.retry?'Try submitting again':fsRequired.current&&!document.fullscreenElement?'Return to full screen and continue':'Return to the quiz'}</button>
    </div></div>}
  </main>;
}

function ResultView({result,m,courseId,onRetry}){
  const nav=useNavigate();
  const [note,setNote]=useState(''),[busy,setBusy]=useState(false);
  const ended=result.status==='terminated';
  const passed=!!result.passed;
  const left=m?.quiz.maxAttempts?Math.max(0,m.quiz.maxAttempts-m.quiz.attemptsUsed):null;
  async function claim(){
    setBusy(true);setNote('');
    try{const {data}=await api.post(`/courses/${courseId}/certificate`);nav('/certificate/'+data.certId)}
    catch(x){setNote(err(x))}finally{setBusy(false)}
  }
  return <main className="page wrap resultview">
    <div className={'resultcard '+(passed?'pass':'fail')}>
      <div className="ring"><b>{result.percent??0}%</b></div>
      <small>{passed?'WELL DONE':ended?'ATTEMPT ENDED':'NOT YET'}</small>
      <h1>{passed?'You passed!':ended?'Your attempt was ended':'You did not pass this time'}</h1>
      <p>{passed?`You scored ${result.score} out of ${result.total}.`
        :result.endReason==='violations'?'You left the quiz window, so this attempt counts as failed.'
        :result.endReason==='time'?'Time ran out before the quiz was submitted.'
        :`You scored ${result.score} out of ${result.total}. The pass mark is ${result.passPercent}%.`}</p>
      {note&&<div className="notice"><b>!</b>{note}</div>}
      <div className="resultactions">
        {passed&&<button className="btn" disabled={busy} onClick={claim}><Award size={16}/> {busy?'One moment...':'Get my certificate'}</button>}
        {!passed&&left!==0&&m?.quiz.unlocked&&<button className="btn" onClick={onRetry}>Try again{left!==null?` (${left} left)`:''}</button>}
        <Link className="btn secondary" to={`/learn/${courseId}`}>Back to course</Link>
      </div>
      {!passed&&left===0&&<p className="muted">You have used all attempts. Please contact your instructor.</p>}
    </div>
  </main>;
}
