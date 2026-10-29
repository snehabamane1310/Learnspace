import React,{useEffect,useState} from 'react';
import {Award,Check,Download,Mail,RefreshCw,Users} from 'lucide-react';
import {api,err} from './api.js';

const day=d=>new Date(d).toLocaleDateString(undefined,{day:'numeric',month:'short',year:'numeric'});

/* ---- email status + test button (admins only) ---- */
export function EmailPanel(){
  const [s,setS]=useState(null),[to,setTo]=useState(''),[busy,setBusy]=useState(false),[msg,setMsg]=useState(null);
  useEffect(()=>{
    api.get('/admin/email/status').then(r=>{
      setS(r.data);
      if(r.data.adminEmail&&!/@example\.(com|org|net)$/i.test(r.data.adminEmail))setTo(r.data.adminEmail);
    }).catch(()=>setS(false));
  },[]);
  if(!s)return null; // instructors do not see this panel
  async function send(){
    setBusy(true);setMsg(null);
    try{const {data}=await api.post('/admin/email/test',{to});setMsg({ok:true,text:data.message})}
    catch(x){setMsg({ok:false,text:err(x)})}finally{setBusy(false)}
  }
  return <div className={'emailpanel '+(s.configured?'on':'off')}>
    <Mail size={20}/>
    <div className="emailinfo">
      <b>Email notifications are {s.configured?'on':'off'}</b>
      <span>{s.configured
        ?`Sending through ${s.host}. You are told when a student enrolls, and students are emailed at 50%, when the certificate unlocks, and at 100%.`
        :'Emails are only printed in the server terminal for now. Add the SMTP lines to server/.env (see .env.example) and restart to send real emails.'}</span>
      {s.configured&&<span>New-enrollment emails go to the course owner, all admins{s.notify.length?` and ${s.notify.join(', ')}`:''}. Placeholder addresses like admin@example.com are skipped, so set ADMIN_NOTIFY_EMAIL to your own address.</span>}
    </div>
    <div className="emailtest">
      <input type="email" placeholder="your@email.com" value={to} onChange={e=>setTo(e.target.value)}/>
      <button className="btn small" disabled={busy||!to} onClick={send}>{busy?'Sending...':'Send test email'}</button>
    </div>
    {msg&&<div className={'emailmsg '+(msg.ok?'ok':'bad')}>{msg.text}</div>}
  </div>;
}

/* ---- who enrolled in the selected course ---- */
export function StudentsPanel({course}){
  const [d,setD]=useState(undefined),[busy,setBusy]=useState(false);
  const load=()=>api.get(`/admin/courses/${course._id}/students`).then(r=>setD(r.data)).catch(()=>setD(null));
  useEffect(()=>{setD(undefined);load()},[course._id]);
  async function csv(){
    setBusy(true);
    try{
      const r=await api.get(`/admin/courses/${course._id}/students.csv`,{responseType:'blob'});
      const url=URL.createObjectURL(r.data);
      const a=document.createElement('a');a.href=url;a.download=`students-${course.title.replace(/[^a-z0-9]+/gi,'-').toLowerCase()}.csv`;
      document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),3000);
    }catch{}finally{setBusy(false)}
  }
  return <div className="stupanel">
    <div className="lessonmanagerhead">
      <div><b>Enrolled students <span className="countpill">{d?d.count:'...'}</span></b><small>Everyone who applied to this course, with their progress</small></div>
      <div className="managerbuttons">
        <button className="btn secondary small" onClick={load}><RefreshCw size={14}/> Refresh</button>
        <button className="btn small" disabled={busy||!d||!d.count} onClick={csv}><Download size={14}/> Download CSV</button>
      </div>
    </div>
    {d===null&&<p className="muted quizhint">Could not load students.</p>}
    {d&&!d.count&&<p className="muted quizhint">No one has enrolled yet. You will get an email as soon as someone does.</p>}
    {d&&d.count>0&&<div className="stuscroll"><table className="stutable">
      <thead><tr><th>Student</th><th>Enrolled</th><th>Progress</th><th>Certificate</th><th>Quiz</th></tr></thead>
      <tbody>{d.students.map(x=><tr key={x.id}>
        <td><b>{x.name}</b><small>{x.email}</small></td>
        <td>{day(x.enrolledAt)}</td>
        <td><div className="minibar"><i style={{width:x.progress+'%'}}/></div><small>{x.progress}% · {x.completedLessons}/{x.totalLessons} lessons</small></td>
        <td>{x.certificate?<span className="yes"><Award size={14}/> Issued</span>:<span className="no">Not yet</span>}</td>
        <td>{x.quizBest==null?<span className="no">Not taken</span>:<span className={x.quizPassed?'yes':'no'}>{x.quizPassed&&<Check size={13}/>} {x.quizBest}%</span>}</td>
      </tr>)}</tbody>
    </table></div>}
  </div>;
}
