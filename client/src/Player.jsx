import React,{useEffect,useState} from 'react';
import {Link,useNavigate,useParams} from 'react-router-dom';
import {ArrowRight,Award,Check,ClipboardList,Lock,Play} from 'lucide-react';
import {api,err} from './api.js';
import VideoPlayer from './VideoPlayer.jsx';
import CodingTest from './CodingTest.jsx';

export default function Player({user}){
  const {id}=useParams(),nav=useNavigate();
  const [e,setE]=useState(),[error,setError]=useState(''),[i,setI]=useState(0),[m,setM]=useState(null),[note,setNote]=useState(''),[busy,setBusy]=useState(false);

  useEffect(()=>{
    if(!user){setError('Sign in and enroll in the course to learn.');return}
    api.get('/me/enrollments').then(r=>{
      const x=r.data.find(x=>x.course._id===id);
      if(!x){setError('Enroll in this course before opening lessons.');return}
      setE(x);
      const last=x.course.lessons.findIndex(l=>l._id===x.lastLesson);
      const firstOpen=x.stats.findIndex(s=>!s.completed||!s.challengePassed);
      setI(last>=0&&!x.stats[last].locked?last:Math.max(0,firstOpen));
    }).catch(x=>setError(err(x)));
  },[id,user]);

  // quiz + certificate status; refreshed whenever course progress changes
  useEffect(()=>{
    if(!e)return;
    api.get(`/courses/${id}/milestones`).then(r=>setM(r.data)).catch(()=>{});
  },[id,e?.progress]);

  if(error)return <main className="page wrap"><div className="notice"><b>!</b>{error}</div><Link to={'/courses/'+id} className="textlink">Back to course →</Link></main>;
  if(!e)return <main className="page wrap">Opening lesson...</main>;

  const lessons=e.course.lessons,n=lessons.length;
  const l=lessons[i],st=e.stats[i];
  const onProgress=data=>setE(p=>p?{...p,stats:data.stats,progress:data.progress,completedLessons:data.completedLessons}:p);
  const onCodePassed=()=>setE(p=>p?{...p,stats:p.stats.map((s,j)=>j===i?{...s,challengePassed:true}:j===i+1?{...s,locked:false}:s)}:p);
  const go=j=>{
    if(e.stats[j].locked)return;
    setI(j);setNote('');
    api.patch(`/enrollments/${e._id}/progress`,{lessonId:lessons[j]._id}).catch(()=>{});
  };
  const nextOpen=i<n-1&&!e.stats[i+1].locked;
  async function claim(){
    setBusy(true);setNote('');
    try{const {data}=await api.post(`/courses/${id}/certificate`);nav('/certificate/'+data.certId)}
    catch(x){setNote(err(x))}finally{setBusy(false)}
  }

  return <main className="player">
    <div className="playertop"><Link to="/dashboard">← My learning</Link><span>{e.course.title}</span><span>{e.progress}% complete</span></div>
    <div className="playerlayout">
      <section>
        {!st.duration
          ?<div className="frame vp-wait"><b>This lesson is not ready yet.</b><span>Your instructor needs to open the Studio once so the video length can be detected.</span></div>
          :<VideoPlayer key={l._id} lesson={l} enrollmentId={e._id} stat={st} onProgress={onProgress}/>}
        <CodingTest enrollmentId={e._id} lesson={l} unlocked={st.challengeUnlocked} onPassed={onCodePassed}/>
        <div className="playerheading">
          <div>
            <small>LESSON {String(i+1).padStart(2,'0')} OF {n}</small>
            <h1>{l.title}</h1>
            <p>{l.description||'Take your time, practice as you go, and enjoy the process.'}</p>
          </div>
          {nextOpen
            ?<button className="btn" onClick={()=>go(i+1)}>Next lesson <ArrowRight size={15}/></button>
            :<span className="lessonstate">{st.completed&&!st.challengePassed?'Pass coding test to continue':st.completed?(i===n-1?'Course finished ✓':'Completed ✓'):<><Lock size={13}/> {st.percent}% watched</>}</span>}
        </div>
        <div className="track"><i style={{width:e.progress+'%'}}/></div>
        {note&&<div className="notice"><b>!</b>{note}</div>}
      </section>

      <aside className="playlist">
        <small>YOUR COURSE</small><b>{e.course.title}</b>
        {lessons.map((x,j)=>{
          const s=e.stats[j];
          return <button className={j===i?'active':''} key={x._id} onClick={()=>go(j)} disabled={s.locked} title={s.locked?'Finish the previous lesson to unlock':''}>
            <span>{s.completed?<Check size={13}/>:s.locked?<Lock size={12}/>:<Play size={12}/>}</span>
            <b>{x.title}<small>{s.completed&&!s.challengePassed?'Coding test required':s.completed?'Completed':s.locked?'Locked':s.percent>0?`${s.percent}% watched`:(x.duration||`Lesson ${j+1}`)}</small></b>
          </button>;
        })}

        {m&&<div className="milestones">
          <small>YOUR GOALS</small>
          <div className="goalbar">
            <i style={{width:m.progress+'%'}}/>
            <em style={{left:m.certificate.minPercent+'%'}} title={`Certificate unlocks at ${m.certificate.minPercent}%`}/>
          </div>
          <div className={'ms '+(m.certificate.unlocked?'on':'')}>
            <Award size={18}/>
            <div><b>Certificate</b><span>{m.certificate.certId?'Issued. View it or download the PDF.':m.certificate.unlocked?'Unlocked! Claim it now.':m.certificate.requiresQuiz&&m.progress>=m.certificate.minPercent?'Pass the quiz to unlock it.':`Unlocks at ${m.certificate.minPercent}% (you are at ${m.progress}%).`}</span></div>
            {(m.certificate.unlocked||m.certificate.certId)&&<button className="btn small" disabled={busy} onClick={claim}>{m.certificate.certId?'View':'Get'}</button>}
          </div>
          {m.quiz.exists&&<div className={'ms '+(m.quiz.unlocked?'on':'')}>
            <ClipboardList size={18}/>
            <div><b>{m.quiz.title}</b><span>{m.quiz.passed?`Passed · best ${m.quiz.best}%`:m.quiz.unlocked?`${m.quiz.questionCount} questions · ${m.quiz.timeLimitMinutes} min · pass ${m.quiz.passPercent}%`:`Finish all lessons to unlock (you are at ${m.progress}%).`}</span></div>
            {m.quiz.unlocked&&!m.quiz.passed&&<Link className="btn small" to={`/courses/${id}/quiz`}>{m.quiz.attemptsUsed?'Retry':'Start'}</Link>}
          </div>}
        </div>}
      </aside>
    </div>
  </main>;
}
