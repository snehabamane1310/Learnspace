// Email sending (Nodemailer). If SMTP is not configured, emails are printed in the server terminal instead,
// so the app keeps working while you set it up. Sending never crashes a request.
import nodemailer from 'nodemailer';

const env=k=>(process.env[k]||'').trim();
export const emailConfigured=()=>!!env('SMTP_HOST');
export const emailInfo=()=>({
  configured:emailConfigured(),
  host:env('SMTP_HOST')||null,
  from:fromAddress(),
  notify:notifyList()
});
const clientUrl=()=>(env('CLIENT_URL')||'http://localhost:5173').replace(/\/$/,'');
export const apiUrl=()=>(env('API_PUBLIC_URL')||`http://localhost:${env('PORT')||5000}`).replace(/\/$/,'');
const fromAddress=()=>env('MAIL_FROM')||`LearnSpace <${env('SMTP_USER')||'no-reply@learnspace.local'}>`;
export const notifyList=()=>env('ADMIN_NOTIFY_EMAIL').split(',').map(x=>x.trim()).filter(Boolean);
// never mail placeholder addresses such as admin@example.com
export const realEmail=e=>!!e&&/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e)&&!/@(example\.(com|org|net)|.*\.local|localhost)$/i.test(e);

let transport=null;
const getTransport=()=>{
  if(!emailConfigured())return null;
  if(!transport)transport=nodemailer.createTransport({
    host:env('SMTP_HOST'),port:Number(env('SMTP_PORT')||587),secure:env('SMTP_SECURE')==='true',
    auth:env('SMTP_USER')?{user:env('SMTP_USER'),pass:env('SMTP_PASS')}:undefined,
    connectionTimeout:10000,greetingTimeout:10000,socketTimeout:20000
  });
  return transport;
};

export async function sendMail({to,subject,html,text}){
  const list=[...new Set([].concat(to).filter(Boolean))];
  if(!list.length)return {ok:false,reason:'No recipient'};
  const t=getTransport();
  if(!t){
    console.log(`\n[email not configured - printed here instead]\nTo: ${list.join(', ')}\nSubject: ${subject}\n${text}\n`);
    return {ok:true,printed:true};
  }
  try{
    await t.sendMail({from:fromAddress(),to:list.join(', '),subject,html,text});
    console.log(`[email sent] "${subject}" -> ${list.join(', ')}`);
    return {ok:true};
  }catch(e){
    console.error(`[email FAILED] "${subject}" -> ${list.join(', ')}: ${e.message}`);
    return {ok:false,reason:e.message};
  }
}

/* ---------- templates ---------- */
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

function build({heading,lines=[],facts=[],buttons=[],note=''}){
  const text=[heading,'',...lines,...(facts.length?['',...facts.map(f=>`${f[0]}: ${f[1]}`)]:[]),'',...buttons.map(b=>`${b.text}: ${b.url}`),...(note?['',note]:[]),'','- LearnSpace'].join('\n');
  const factRows=facts.map(f=>`<tr><td style="padding:6px 14px 6px 0;color:#6b756f;font-size:13px">${esc(f[0])}</td><td style="padding:6px 0;font-size:14px;color:#22302a"><b>${esc(f[1])}</b></td></tr>`).join('');
  const btns=buttons.map((b,i)=>`<a href="${esc(b.url)}" style="display:inline-block;margin:6px 8px 0 0;padding:12px 22px;border-radius:8px;text-decoration:none;font-size:14px;font-weight:600;${i===0?'background:#326348;color:#ffffff':'background:#e9f1ea;color:#244735'}">${esc(b.text)}</a>`).join('');
  const html=`<div style="background:#f4f6f1;padding:28px 12px;font-family:Segoe UI,Arial,sans-serif"><div style="max-width:540px;margin:auto;background:#ffffff;border-radius:12px;padding:30px;border:1px solid #e1e8df"><div style="font-size:20px;font-weight:700;color:#22302a;margin-bottom:22px">learnspace<span style="color:#5d9b70">.</span></div><h1 style="font-size:21px;line-height:1.35;margin:0 0 14px;color:#22302a">${esc(heading)}</h1>${lines.map(l=>`<p style="font-size:14px;line-height:1.7;color:#4a5750;margin:0 0 12px">${esc(l)}</p>`).join('')}${factRows?`<table style="margin:10px 0 14px;border-collapse:collapse">${factRows}</table>`:''}<div style="margin-top:18px">${btns}</div>${note?`<p style="font-size:12px;color:#8a948d;margin:22px 0 0;line-height:1.6">${esc(note)}</p>`:''}</div></div>`;
  return {html,text};
}

export const mail={
  staffEnrollment({course,student,total,to}){
    const m=build({heading:`${student.name} just enrolled in "${course.title}"`,
      lines:['A new student applied to your course.'],
      facts:[['Student',student.name],['Email',student.email],['Course',course.title],['Total enrolled now',String(total)],['When',new Date().toLocaleString('en-GB')]],
      buttons:[{text:'Open Studio',url:`${clientUrl()}/admin`}]});
    return sendMail({to,subject:`New enrollment: ${student.name} joined "${course.title}" (${total} ${total===1?'learner':'learners'})`,...m});
  },
  welcome({course,student}){
    const m=build({heading:`Welcome to "${course.title}", ${student.name.split(' ')[0]}!`,
      lines:['You are enrolled. Lessons unlock one by one as you finish them, and each lesson counts only when you have really watched it.','Reach 75% of the course to earn your certificate.'],
      buttons:[{text:'Start learning',url:`${clientUrl()}/learn/${course._id}`}]});
    return sendMail({to:student.email,subject:`You're enrolled: ${course.title}`,...m});
  },
  half({course,student,progress}){
    const m=build({heading:`You're halfway through "${course.title}"`,
      lines:[`Nice work, ${student.name.split(' ')[0]}. You have completed ${progress}% of the course.`,'Keep going: your certificate unlocks at 75%.'],
      buttons:[{text:'Continue learning',url:`${clientUrl()}/learn/${course._id}`}]});
    return sendMail({to:student.email,subject:`Halfway there: ${progress}% of "${course.title}" done`,...m});
  },
  certificate({course,student,progress,certId}){
    const m=build({heading:`Your certificate for "${course.title}" is ready`,
      lines:[`Congratulations, ${student.name.split(' ')[0]}! You have completed ${progress}% of the course and earned your certificate.`,`Certificate ID: ${certId}`,'You can view it online, print it, or download it as a PDF.'],
      buttons:[{text:'View certificate',url:`${clientUrl()}/certificate/${certId}`},{text:'Download PDF',url:`${apiUrl()}/api/certificates/${certId}/pdf`}]});
    return sendMail({to:student.email,subject:`Your certificate is ready: ${course.title}`,...m});
  },
  complete({course,student,certId,quizPending}){
    const lines=[`You finished every lesson, ${student.name.split(' ')[0]}. Well done!`];
    const buttons=[];
    if(certId){lines.push(`Your certificate (ID ${certId}) is ready.`);buttons.push({text:'View certificate',url:`${clientUrl()}/certificate/${certId}`},{text:'Download PDF',url:`${apiUrl()}/api/certificates/${certId}/pdf`})}
    if(quizPending){lines.push('The course also has a final quiz you can take now.');buttons.push({text:'Take the final quiz',url:`${clientUrl()}/courses/${course._id}/quiz`})}
    if(!buttons.length)buttons.push({text:'Back to the course',url:`${clientUrl()}/learn/${course._id}`});
    const m=build({heading:`Course complete: "${course.title}"`,lines,buttons});
    return sendMail({to:student.email,subject:`Course complete: ${course.title}`,...m});
  },
  test({to}){
    const m=build({heading:'Your LearnSpace email is working',lines:['If you can read this, students and admins will receive notifications.'],buttons:[{text:'Open LearnSpace',url:clientUrl()}]});
    return sendMail({to,subject:'LearnSpace test email',...m});
  }
};
