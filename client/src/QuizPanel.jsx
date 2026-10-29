import React,{useEffect,useState} from 'react';
import {ClipboardList,Plus,ShieldCheck,X} from 'lucide-react';
import {api,err} from './api.js';

const blankQ=()=>({text:'',options:['','','',''],correctIndex:0});
const blankQuiz=()=>({title:'Final quiz',passPercent:70,timeLimitMinutes:20,maxAttempts:3,questions:[blankQ()]});

export default function QuizPanel({course,notify}){
  const [quiz,setQuiz]=useState(undefined),[f,setF]=useState(null),[busy,setBusy]=useState(false),[error,setError]=useState('');

  useEffect(()=>{
    setQuiz(undefined);setF(null);
    api.get(`/admin/courses/${course._id}/quiz`).then(r=>setQuiz(r.data||null)).catch(()=>setQuiz(null));
  },[course._id]);

  const open=()=>{setError('');setF(quiz?JSON.parse(JSON.stringify(quiz)):blankQuiz())};
  const setQ=(qi,patch)=>setF({...f,questions:f.questions.map((q,i)=>i===qi?{...q,...patch}:q)});
  const setOpt=(qi,oi,v)=>setQ(qi,{options:f.questions[qi].options.map((o,i)=>i===oi?v:o)});
  const addOpt=qi=>setQ(qi,{options:[...f.questions[qi].options,'']});
  const delOpt=(qi,oi)=>{
    const q=f.questions[qi];
    setQ(qi,{options:q.options.filter((_,i)=>i!==oi),correctIndex:q.correctIndex===oi?0:q.correctIndex>oi?q.correctIndex-1:q.correctIndex});
  };

  async function save(ev){
    ev.preventDefault();setBusy(true);setError('');
    try{
      const {data}=await api.put(`/admin/courses/${course._id}/quiz`,f);
      setQuiz(data);setF(null);notify('Quiz saved.');
    }catch(x){setError(err(x))}finally{setBusy(false)}
  }
  async function remove(){
    if(!confirm('Delete this quiz and all student attempts for it?'))return;
    try{await api.delete(`/admin/courses/${course._id}/quiz`);setQuiz(null);notify('Quiz deleted.')}
    catch(x){notify(err(x))}
  }

  return <div className="quizpanel">
    <div className="lessonmanagerhead">
      <div><b>Final quiz</b><small>Students unlock it after finishing every lesson</small></div>
      <div className="managerbuttons">
        {quiz&&<button className="btn secondary small" disabled={course.published} title={course.published?"Unpublish the course before deleting its quiz":"Delete quiz"} onClick={remove}>Delete</button>}
        <button className="btn small" disabled={quiz===undefined} onClick={open}>{quiz?'Edit quiz':<><Plus size={15}/> Create quiz</>}</button>
      </div>
    </div>
    {quiz?<div className="quizsummary"><ClipboardList size={18}/><span><b>{quiz.title}</b>{quiz.questions.length} questions · pass mark {quiz.passPercent}% · {quiz.timeLimitMinutes} min · {quiz.maxAttempts?`${quiz.maxAttempts} attempts`:'unlimited attempts'}</span></div>
      :quiz===null&&<p className="muted quizhint">No quiz yet. Without a quiz, students can still finish lessons and earn the certificate.</p>}
    <div className="st-notice"><ShieldCheck size={16}/> A quiz attempt ends if a learner switches tabs, changes windows, or leaves fullscreen.</div>

    {f&&<div className="overlay"><div className="modal wide">
      <button className="close" onClick={()=>setF(null)} type="button"><X/></button>
      <small>FINAL QUIZ</small><h2>{quiz?'Edit quiz':'Create quiz'}</h2><p>Multiple choice, one correct answer per question.</p>
      {error&&<div className="notice"><b>!</b>{error}</div>}
      <form onSubmit={save}>
        <label>Quiz title<input required value={f.title} onChange={e=>setF({...f,title:e.target.value})}/></label>
        <div className="formrow3">
          <label>Pass mark (%)<input type="number" min="1" max="100" required value={f.passPercent} onChange={e=>setF({...f,passPercent:e.target.value})}/></label>
          <label>Time limit (min)<input type="number" min="1" max="180" required value={f.timeLimitMinutes} onChange={e=>setF({...f,timeLimitMinutes:e.target.value})}/></label>
          <label>Attempts <small>(0 = unlimited)</small><input type="number" min="0" max="20" required value={f.maxAttempts} onChange={e=>setF({...f,maxAttempts:e.target.value})}/></label>
        </div>
        {f.questions.map((q,qi)=><div className="qedit" key={q._id||qi}>
          <div className="qedit-head"><b>Question {qi+1}</b>{f.questions.length>1&&<button type="button" className="linkbtn danger" onClick={()=>setF({...f,questions:f.questions.filter((_,i)=>i!==qi)})}>Remove</button>}</div>
          <label>Question<textarea rows="2" required value={q.text} onChange={e=>setQ(qi,{text:e.target.value})} placeholder="What does HTML stand for?"/></label>
          <small className="qhint">Select the round button next to the correct answer.</small>
          {q.options.map((o,oi)=><div className="qoptedit" key={oi}>
            <input type="radio" name={'correct'+qi} checked={q.correctIndex===oi} onChange={()=>setQ(qi,{correctIndex:oi})} title="Correct answer"/>
            <input required value={o} onChange={e=>setOpt(qi,oi,e.target.value)} placeholder={`Option ${oi+1}`}/>
            {q.options.length>2&&<button type="button" className="linkbtn" onClick={()=>delOpt(qi,oi)} title="Remove option"><X size={14}/></button>}
          </div>)}
          {q.options.length<6&&<button type="button" className="linkbtn" onClick={()=>addOpt(qi)}>+ Add option</button>}
        </div>)}
        {f.questions.length<100&&<button type="button" className="btn secondary small" onClick={()=>setF({...f,questions:[...f.questions,blankQ()]})}><Plus size={14}/> Add question</button>}
        <button className="btn full" disabled={busy}>{busy?'Saving...':'Save quiz'}</button>
      </form>
    </div></div>}
  </div>;
}
