import React,{useEffect,useState} from 'react';
import {Link,useParams} from 'react-router-dom';
import {ArrowRight,Award,Check,Copy,Download,GraduationCap,Printer} from 'lucide-react';
import {api,err} from './api.js';

const fmtDate=d=>new Date(d).toLocaleDateString(undefined,{year:'numeric',month:'long',day:'numeric'});

// downloads the certificate as a real PDF file
export async function downloadCertificate(certId){
  const r=await api.get(`/certificates/${certId}/pdf`,{responseType:'blob'});
  const url=URL.createObjectURL(r.data);
  const a=document.createElement('a');
  a.href=url;a.download=`LearnSpace-Certificate-${certId}.pdf`;
  document.body.appendChild(a);a.click();a.remove();
  setTimeout(()=>URL.revokeObjectURL(url),3000);
}

export function CertificatePage(){
  const {certId}=useParams();
  const [c,setC]=useState(null),[error,setError]=useState(''),[busy,setBusy]=useState(false),[msg,setMsg]=useState('');
  const download=async()=>{
    setBusy(true);setMsg('');
    try{await downloadCertificate(certId);setMsg('Downloaded. Check your Downloads folder.')}
    catch{setMsg('Could not download the PDF. Make sure the server is running, then try again.')}
    finally{setBusy(false)}
  };
  const copy=async()=>{
    try{await navigator.clipboard.writeText(window.location.href);setMsg('Link copied.')}
    catch{setMsg('Copy this page address from your browser bar.')}
  };
  useEffect(()=>{api.get('/certificates/'+certId).then(r=>setC(r.data)).catch(x=>setError(err(x)))},[certId]);
  if(error)return <main className="page wrap"><div className="notice"><b>!</b>{error}</div><Link className="textlink" to="/">Go home →</Link></main>;
  if(!c)return <main className="page wrap">Loading certificate...</main>;
  return <main className="certpage wrap">
    <div className="certbar noprint">
      <Link to="/dashboard">← My learning</Link>
      <div className="certactions">
        <button className="btn secondary" onClick={copy}><Copy size={15}/> Copy link</button>
        <button className="btn secondary" onClick={()=>window.print()}><Printer size={15}/> Print</button>
        <button className="btn" disabled={busy} onClick={download}><Download size={15}/> {busy?'Preparing...':'Download PDF'}</button>
      </div>
    </div>
    {msg&&<div className="success noprint"><Check size={15}/>{msg}</div>}
    <div className="cert">
      <div className="cert-inner">
        <div className="cert-brand"><span><GraduationCap/></span>learnspace<i>.</i></div>
        <small>CERTIFICATE OF COMPLETION</small>
        <p className="cert-lead">This is to certify that</p>
        <h1>{c.studentName}</h1>
        <p className="cert-lead">has successfully completed the course</p>
        <h2>{c.courseTitle}</h2>
        <div className="cert-stats">
          <span><b>{c.progress}%</b>course completed</span>
          {c.quizPercent!=null&&<span><b>{c.quizPercent}%</b>quiz score</span>}
        </div>
        <div className="cert-foot">
          <div><b>{fmtDate(c.issuedAt)}</b><small>Date issued</small></div>
          <div className="cert-seal"><Award size={34}/></div>
          <div><b>{c.instructorName}</b><small>Instructor</small></div>
        </div>
        <div className="cert-id">Certificate ID: {c.certId}</div>
      </div>
    </div>
    <p className="certverify noprint">Anyone can verify this certificate at <b>{window.location.origin}/certificate/{c.certId}</b></p>
  </main>;
}

export function MyCertificates(){
  const [list,setList]=useState([]),[busy,setBusy]=useState(''),[msg,setMsg]=useState('');
  useEffect(()=>{api.get('/me/certificates').then(r=>setList(r.data)).catch(()=>{})},[]);
  if(!list.length)return null;
  const get=async id=>{
    setBusy(id);setMsg('');
    try{await downloadCertificate(id)}catch{setMsg('Could not download the PDF. Make sure the server is running.')}
    finally{setBusy('')}
  };
  return <section className="mycerts">
    <div className="secthead"><div><small>YOUR ACHIEVEMENTS</small><h2>My certificates</h2></div></div>
    {msg&&<div className="notice"><b>!</b>{msg}</div>}
    <div className="certlist">{list.map(x=><div className="certitem" key={x.certId}>
      <Award/><span><b>{x.courseTitle}</b><small>{fmtDate(x.issuedAt)} · {x.certId}</small></span>
      <div className="certitem-actions">
        <Link className="btn secondary small" to={'/certificate/'+x.certId}>View</Link>
        <button className="btn small" disabled={busy===x.certId} onClick={()=>get(x.certId)}><Download size={14}/> PDF</button>
      </div>
    </div>)}</div>
  </section>;
}
