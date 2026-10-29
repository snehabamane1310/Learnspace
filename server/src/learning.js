// Learning rules: genuine-watch tracking, sequential lessons, quizzes with proctoring, certificates.
import crypto from 'node:crypto';
import mongoose from 'mongoose';
import {User,Course,Enrollment,Quiz,QuizAttempt,Certificate,CodeAttempt} from './models.js';
import {mail,emailInfo,realEmail,apiUrl} from './mailer.js';
import {streamCertificate} from './certificatePdf.js';

const num=(v,d)=>{const n=Number(v);return Number.isFinite(n)?n:d};
// Read lazily so values from server/.env are always picked up. All are optional.
export const cfg=()=>({
  certMin:75, // certificate threshold is fixed at 75%
  certNeedsQuiz:process.env.CERT_REQUIRES_QUIZ==='true',     // also require passing the quiz?
  quizUnlock:100, // final course quiz unlocks only after all lessons
  maxViolations:1 // a detected tab switch ends the attempt
});

/* ---------- watch-range helpers ---------- */
const mergeRanges=(rs,bridge=0)=>{
  const a=rs.map(r=>[Number(r[0]),Number(r[1])]).filter(r=>r[1]>r[0]).sort((x,y)=>x[0]-y[0]);
  const out=[];
  for(const r of a){const l=out[out.length-1];if(l&&r[0]<=l[1]+bridge)l[1]=Math.max(l[1],r[1]);else out.push(r)}
  return out;
};
const covered=rs=>mergeRanges(rs).reduce((n,r)=>n+r[1]-r[0],0);
// furthest point reachable by continuous watching from the start
const frontier=rs=>{const m=mergeRanges(rs,2);return m.length&&m[0][0]<=3?m[0][1]:0};

const toPairs=lp=>lp.ranges.map(r=>[r.s,r.e]);
const fromPairs=ps=>ps.map(([s,e])=>({s,e}));
const sameId=(a,b)=>String(a)===String(b);
const lessonStats=(e,c)=>{
  const doneIdx=c.lessons.map(l=>e.completedLessons.some(x=>sameId(x,l._id)));
  const codePassed=l=>(e.passedCodeLessons||[]).some(x=>sameId(x,l._id));
  const firstOpen=c.lessons.findIndex((l,i)=>!doneIdx[i]||!codePassed(l)); // coding challenge required before the next lesson unlocks
  return c.lessons.map((l,i)=>{
    const lp=e.lessonProgress.find(x=>sameId(x.lesson,l._id));
    const dur=l.durationSeconds||0;
    const cov=lp?covered(toPairs(lp)):0;
    return {
      lessonId:l._id,
      duration:dur,
      watched:Math.round(cov),
      percent:doneIdx[i]?100:(dur?Math.min(99,Math.floor(cov/dur*100)):0),
      frontier:doneIdx[i]?0:Math.floor(lp?frontier(toPairs(lp)):0),
      completed:doneIdx[i],
      challengeUnlocked:dur>0&&cov>=dur*0.75,
      challengePassed:codePassed(l),
      locked:firstOpen!==-1&&i>firstOpen
    };
  });
};
const progressOf=(e,c)=>c.lessons.length?Math.round(e.completedLessons.length/c.lessons.length*100):0;

const httpError=(status,message)=>Object.assign(new Error(message),{status});
const validQuizBody=b=>{
  const title=String(b.title||'Final quiz').trim().slice(0,120)||'Final quiz';
  const passPercent=Math.round(num(b.passPercent,70));
  const timeLimitMinutes=Math.round(num(b.timeLimitMinutes,20));
  const maxAttempts=Math.round(num(b.maxAttempts,3));
  if(passPercent<1||passPercent>100)throw httpError(400,'Pass mark must be between 1 and 100.');
  if(timeLimitMinutes<1||timeLimitMinutes>180)throw httpError(400,'Time limit must be between 1 and 180 minutes.');
  if(maxAttempts<0||maxAttempts>20)throw httpError(400,'Attempts must be between 0 (unlimited) and 20.');
  if(!Array.isArray(b.questions)||!b.questions.length)throw httpError(400,'Add at least one question.');
  if(b.questions.length>100)throw httpError(400,'A quiz can have at most 100 questions.');
  const questions=b.questions.map((x,i)=>{
    const text=String(x.text||'').trim();
    const options=(Array.isArray(x.options)?x.options:[]).map(o=>String(o).trim());
    if(!text)throw httpError(400,`Question ${i+1} needs text.`);
    if(options.length<2||options.length>6||options.some(o=>!o))throw httpError(400,`Question ${i+1} needs 2 to 6 non-empty options.`);
    const correctIndex=Math.round(num(x.correctIndex,-1));
    if(correctIndex<0||correctIndex>=options.length)throw httpError(400,`Choose the correct answer for question ${i+1}.`);
    const q={text:text.slice(0,500),options:options.map(o=>o.slice(0,200)),correctIndex};
    if(x._id&&mongoose.isValidObjectId(x._id))q._id=x._id;
    return q;
  });
  return {title,passPercent,timeLimitMinutes,maxAttempts,questions};
};

const shuffle=n=>{const a=[...Array(n).keys()];for(let i=n-1;i>0;i--){const j=crypto.randomInt(i+1);[a[i],a[j]]=[a[j],a[i]]}return a};
const resultOf=(a,quiz)=>({status:a.status,endReason:a.endReason,score:a.score,total:a.total,percent:a.percent,passed:a.passed,passPercent:quiz?.passPercent,violations:a.violations});

export function registerLearningRoutes(app,{auth,roles,run,owned,view}){
  const h=fn=>run(async(q,s,n)=>{try{await fn(q,s,n)}catch(e){if(e.status)return s.status(e.status).json({message:e.message});throw e}});

  const loadStudentCourse=async(q)=>{
    const c=await Course.findOne({_id:q.params.id,published:true});
    if(!c)throw httpError(404,'Course not found.');
    const e=await Enrollment.findOne({student:q.user.id,course:c._id});
    if(!e)throw httpError(403,'Enroll in this course first.');
    return {c,e};
  };

  const milestonesFor=async(studentId,c,e)=>{
    const k=cfg();
    const progress=progressOf(e,c);
    const quiz=await Quiz.findOne({course:c._id});
    const attempts=await QuizAttempt.find({student:studentId,course:c._id,status:{$ne:'in_progress'}});
    const passed=attempts.some(a=>a.passed);
    const best=attempts.reduce((m,a)=>Math.max(m,a.percent||0),0);
    const exists=!!quiz&&quiz.questions.length>0;
    const codingComplete=c.lessons.every(l=>(e.passedCodeLessons||[]).some(x=>sameId(x,l._id)));
    const cert=await Certificate.findOne({student:studentId,course:c._id});
    return {
      progress,
      quiz:{exists,unlocked:progress>=k.quizUnlock&&codingComplete,minPercent:k.quizUnlock,passed,best,attemptsUsed:attempts.length,
        maxAttempts:quiz?.maxAttempts??0,questionCount:quiz?.questions.length||0,timeLimitMinutes:quiz?.timeLimitMinutes||0,
        passPercent:quiz?.passPercent||0,title:quiz?.title||'Final quiz',maxViolations:k.maxViolations},
      certificate:{minPercent:k.certMin,requiresQuiz:k.certNeedsQuiz&&exists,
        unlocked:progress>=k.certMin&&(!k.certNeedsQuiz||!exists||passed),certId:cert?.certId||null},
      _best:best
    };
  };

  const newCertId=()=>{const x=crypto.randomBytes(6).toString('hex').toUpperCase();return `LS-${x.slice(0,6)}-${x.slice(6)}`};
  const createCertificate=async(studentId,c,m)=>{
    const [user,inst]=await Promise.all([User.findById(studentId),User.findById(c.instructor)]);
    try{
      return await Certificate.create({certId:newCertId(),student:studentId,course:c._id,studentName:user?.name||'Learner',
        courseTitle:c.title,instructorName:inst?.name||'LearnSpace team',progress:m.progress,
        quizPercent:m.quiz.exists&&m.quiz.attemptsUsed?m._best:null});
    }catch(err){if(err.code===11000)return Certificate.findOne({student:studentId,course:c._id});throw err}
  };

  // Runs in the background after a lesson is completed or a quiz is passed:
  // issues the certificate automatically once it is unlocked, and sends each milestone email exactly once.
  const afterProgress=async(studentId,c)=>{
    try{
      const e=await Enrollment.findOne({student:studentId,course:c._id});
      if(!e)return;
      const m=await milestonesFor(studentId,c,e);
      let cert=await Certificate.findOne({student:studentId,course:c._id});
      if(!cert&&m.certificate.unlocked)cert=await createCertificate(studentId,c,m);
      if(cert&&(m.progress>cert.progress||(m.quiz.attemptsUsed&&cert.quizPercent!==m._best))){ // keep the certificate up to date
        cert.progress=Math.max(cert.progress,m.progress);
        if(m.quiz.exists&&m.quiz.attemptsUsed)cert.quizPercent=m._best;
        await cert.save();
      }
      const p=m.progress,n=e.notified||{};
      // 'complete' beats 'cert' beats 'half'; sending a higher one marks the lower ones as sent too
      const kind=(p>=100&&!n.done)?'complete':(cert&&!n.cert)?'cert':(p>=50&&!n.half)?'half':null;
      if(!kind)return;
      const now=new Date();
      const flags={complete:{half:now,done:now,...(cert?{cert:now}:{})},cert:{cert:now,...(p>=50?{half:now}:{})},half:{half:now}}[kind];
      const key=kind==='complete'?'done':kind;
      const claim=await Enrollment.updateOne({_id:e._id,[`notified.${key}`]:null},{$set:Object.fromEntries(Object.entries(flags).map(([k,v])=>[`notified.${k}`,v]))});
      if(!claim.modifiedCount)return; // another request already sent it
      const student=await User.findById(studentId);
      if(!student||!realEmail(student.email))return;
      const info={course:c,student,progress:p};
      if(kind==='half')await mail.half(info);
      else if(kind==='cert')await mail.certificate({...info,certId:cert.certId});
      else await mail.complete({...info,certId:cert?.certId,quizPending:m.quiz.exists&&!m.quiz.passed});
    }catch(err){console.error('[notify] milestone error:',err.message)}
  };

  /* ===== enrollments with progress ===== */
  app.get('/api/me/enrollments',auth,roles('student'),h(async(q,s)=>{
    const es=await Enrollment.find({student:q.user.id}).populate({path:'course',populate:{path:'instructor',select:'name'}}).sort({updatedAt:-1});
    s.json(es.filter(e=>e.course?.published).map(e=>{
      const stats=lessonStats(e,e.course);
      const v=view(e.course);
      v.lessons=v.lessons.map((l,i)=>stats[i].locked?{...l,youtubeId:undefined}:l); // don't hand out locked video ids
      const o=e.toObject();delete o.lessonProgress;
      return {...o,course:v,stats,progress:progressOf(e,e.course)};
    }));
  }));

  /* ===== genuine-watch heartbeat ===== */
  app.post('/api/enrollments/:id/watch',auth,roles('student'),h(async(q,s)=>{
    const e=await Enrollment.findOne({_id:q.params.id,student:q.user.id});
    if(!e)throw httpError(404,'Enrollment not found.');
    const c=await Course.findById(e.course);
    if(!c||!c.published)throw httpError(404,'Course not found.');
    const idx=c.lessons.findIndex(l=>sameId(l._id,q.body.lessonId));
    if(idx<0)throw httpError(404,'Lesson not found.');
    const l=c.lessons[idx];
    const before=lessonStats(e,c);
    if(before[idx].locked)throw httpError(403,'Finish the previous lesson first.');
    const reply=()=>({stats:lessonStats(e,c),progress:progressOf(e,c),completedLessons:e.completedLessons});
    const prevDone=e.completedLessons.length;
    if(before[idx].completed)return s.json(reply());
    if(!l.durationSeconds)throw httpError(409,'This lesson is not ready yet. Ask your instructor to open the Studio once so the video length is detected.');

    let lp=e.lessonProgress.find(x=>sameId(x.lesson,l._id));
    if(!lp){e.lessonProgress.push({lesson:l._id,ranges:[],wall:0});lp=e.lessonProgress[e.lessonProgress.length-1]}
    const pos=Math.max(0,Math.min(l.durationSeconds,num(q.body.position,0)));
    const playing=q.body.playing===true;
    const now=Date.now();
    const elapsed=lp.lastBeatAt?(now-lp.lastBeatAt.getTime())/1000:Infinity;

    // Credit only continuous playback: the previous beat said "playing", the gap is short, and the video
    // advanced forward by a normal amount. Seeks / jumps earn nothing. Total credit can never outrun
    // the real time spent playing (wall clock), so fast-forwarding cannot work.
    if(lp.lastPlaying&&elapsed<=15&&lp.lastPos!=null){
      lp.wall+=elapsed;
      const delta=pos-lp.lastPos;
      if(delta>0&&delta<=15){
        const cand=[...toPairs(lp),[lp.lastPos,pos]];
        if(covered(cand)<=lp.wall+6)lp.ranges=fromPairs(mergeRanges(cand));
      }
    }
    lp.lastPos=pos;lp.lastBeatAt=new Date(now);lp.lastPlaying=playing;
    e.lastLesson=l._id;

    const completeAt=Math.max(0,l.durationSeconds-5);
    if(covered(toPairs(lp))>=completeAt){
      lp.completed=true;lp.completedAt=new Date();
      if(!e.completedLessons.some(x=>sameId(x,l._id)))e.completedLessons.push(l._id);
    }
    try{await e.save()}catch(err){if(err.name==='VersionError')return s.status(409).json({message:'Busy, retry.'});throw err}
    if(e.completedLessons.length>prevDone)afterProgress(q.user.id,c);
    s.json(reply());
  }));

  // remember which lesson the student opened last (cannot mark anything complete)
  app.patch('/api/enrollments/:id/progress',auth,roles('student'),h(async(q,s)=>{
    const e=await Enrollment.findOne({_id:q.params.id,student:q.user.id});
    if(!e)throw httpError(404,'Enrollment not found.');
    const c=await Course.findById(e.course);
    const i=c?c.lessons.findIndex(l=>sameId(l._id,q.body.lessonId)):-1;
    if(i<0)throw httpError(404,'Lesson not found.');
    if(lessonStats(e,c)[i].locked)throw httpError(403,'Finish the previous lesson first.');
    e.lastLesson=c.lessons[i]._id;
    try{await e.save()}catch(err){if(err.name!=='VersionError')throw err}
    s.json({ok:true});
  }));

  /* ===== milestones (quiz + certificate status) ===== */
  app.get('/api/courses/:id/milestones',auth,roles('student'),h(async(q,s)=>{
    const {c,e}=await loadStudentCourse(q);
    const m=await milestonesFor(q.user.id,c,e);delete m._best;
    s.json(m);
  }));

  /* ===== student quiz ===== */
  app.post('/api/courses/:id/quiz/start',auth,roles('student'),h(async(q,s)=>{
    const {c,e}=await loadStudentCourse(q);
    const k=cfg();
    const quiz=await Quiz.findOne({course:c._id});
    if(!quiz||!quiz.questions.length)throw httpError(404,'This course has no quiz yet.');
    if(progressOf(e,c)<k.quizUnlock)throw httpError(403,`Complete ${k.quizUnlock}% of the course to unlock the quiz.`);
    if(c.lessons.some(l=>!(e.passedCodeLessons||[]).some(x=>sameId(x,l._id))))throw httpError(403,'Pass each video coding test before starting the course quiz.');

    let a=await QuizAttempt.findOne({student:q.user.id,course:c._id,status:'in_progress'});
    if(a&&Date.now()>a.expiresAt.getTime()+15000){ // abandoned and out of time -> counts as a failed attempt
      Object.assign(a,{status:'terminated',endReason:'time',score:0,percent:0,passed:false,submittedAt:new Date()});
      await a.save();a=null;
    }
    if(!a){
      const done=await QuizAttempt.find({student:q.user.id,course:c._id,status:{$ne:'in_progress'}});
      if(done.some(x=>x.passed))throw httpError(403,'You have already passed this quiz.');
      if(quiz.maxAttempts&&done.length>=quiz.maxAttempts)throw httpError(403,'You have used all attempts for this quiz.');
      a=await QuizAttempt.create({student:q.user.id,course:c._id,quiz:quiz._id,order:shuffle(quiz.questions.length),
        total:quiz.questions.length,expiresAt:new Date(Date.now()+quiz.timeLimitMinutes*60000)});
    }
    s.json({attemptId:a._id,title:quiz.title,expiresAt:a.expiresAt.getTime(),serverNow:Date.now(),violations:a.violations,
      maxViolations:k.maxViolations,passPercent:quiz.passPercent,
      questions:a.order.map(i=>quiz.questions[i]).filter(Boolean).map(x=>({id:x._id,text:x.text,options:x.options}))});
  }));

  app.post('/api/quiz/attempts/:id/violation',auth,roles('student'),h(async(q,s)=>{
    const a=await QuizAttempt.findOne({_id:q.params.id,student:q.user.id});
    if(!a)throw httpError(404,'Attempt not found.');
    const max=cfg().maxViolations;
    if(a.status!=='in_progress')return s.json({violations:a.violations,maxViolations:max,terminated:a.status==='terminated',finished:true});
    const last=a.violationLog[a.violationLog.length-1];
    if(!last||Date.now()-last.at.getTime()>2000){ // blur + visibilitychange fire together; count once
      a.violations+=1;
      a.violationLog.push({type:String(q.body.type||'unknown').slice(0,30),at:new Date()});
      if(a.violations>=max)Object.assign(a,{status:'terminated',endReason:'violations',score:0,percent:0,passed:false,submittedAt:new Date()});
      await a.save();
    }
    const quiz=await Quiz.findById(a.quiz);
    s.json({violations:a.violations,maxViolations:max,terminated:a.status==='terminated',result:a.status==='terminated'?resultOf(a,quiz):undefined});
  }));

  app.post('/api/quiz/attempts/:id/submit',auth,roles('student'),h(async(q,s)=>{
    const a=await QuizAttempt.findOne({_id:q.params.id,student:q.user.id});
    if(!a)throw httpError(404,'Attempt not found.');
    const quiz=await Quiz.findById(a.quiz);
    if(a.status!=='in_progress')return s.status(409).json({message:'This attempt is already finished.',result:resultOf(a,quiz)});
    const late=Date.now()>a.expiresAt.getTime()+15000;
    const given=new Map((Array.isArray(q.body.answers)?q.body.answers:[]).map(x=>[String(x.questionId),Math.round(num(x.choice,-1))]));
    let score=0;
    if(!late)for(const qu of quiz.questions)if(given.get(String(qu._id))===qu.correctIndex)score++;
    a.answers=quiz.questions.filter(qu=>given.has(String(qu._id))).map(qu=>({question:qu._id,choice:given.get(String(qu._id))}));
    a.score=score;a.total=quiz.questions.length;
    a.percent=a.total?Math.round(score/a.total*100):0;
    a.passed=!late&&a.percent>=quiz.passPercent;
    a.status='submitted';a.endReason=late?'time':'';a.submittedAt=new Date();
    await a.save();
    if(a.passed)Course.findById(a.course).then(c=>c&&afterProgress(q.user.id,c));
    s.json({result:resultOf(a,quiz)});
  }));

  /* ===== quiz management (admin / instructor) ===== */
  const ownCourse=async(q)=>{
    const c=await Course.findById(q.params.id);
    if(!c)throw httpError(404,'Course not found.');
    if(!owned(c,q.user))throw httpError(403,'You can only edit your own courses.');
    return c;
  };
  app.get('/api/admin/courses/:id/quiz',auth,roles('admin','instructor'),h(async(q,s)=>{
    const c=await ownCourse(q);s.json(await Quiz.findOne({course:c._id}));
  }));
  app.put('/api/admin/courses/:id/quiz',auth,roles('admin','instructor'),h(async(q,s)=>{
    const c=await ownCourse(q);
    const body=validQuizBody(q.body||{});
    const quiz=await Quiz.findOne({course:c._id})||new Quiz({course:c._id});
    quiz.set(body);
    await quiz.save();
    s.json(quiz);
  }));
  app.delete('/api/admin/courses/:id/quiz',auth,roles('admin','instructor'),h(async(q,s)=>{
    const c=await ownCourse(q);
    if(c.published)throw httpError(400,'Unpublish the course before deleting its quiz.');
    const quiz=await Quiz.findOne({course:c._id});
    if(quiz)await Promise.all([quiz.deleteOne(),QuizAttempt.deleteMany({quiz:quiz._id})]);
    s.json({message:'Quiz deleted.'});
  }));

  /* ===== certificates ===== */
  app.post('/api/courses/:id/certificate',auth,roles('student'),h(async(q,s)=>{
    const {c,e}=await loadStudentCourse(q);
    const existing=await Certificate.findOne({student:q.user.id,course:c._id});
    if(existing)return s.json({certId:existing.certId});
    const m=await milestonesFor(q.user.id,c,e);
    if(!m.certificate.unlocked){
      const k=cfg();
      throw httpError(403,m.progress<k.certMin?`Complete ${k.certMin}% of the course to unlock your certificate (you are at ${m.progress}%).`:'Pass the course quiz to unlock your certificate.');
    }
    const cert=await createCertificate(q.user.id,c,m);
    afterProgress(q.user.id,c);
    s.status(201).json({certId:cert.certId});
  }));
  app.get('/api/me/certificates',auth,roles('student'),h(async(q,s)=>{
    const rows=await Certificate.find({student:q.user.id}).sort({issuedAt:-1});
    s.json(rows.map(x=>({certId:x.certId,courseTitle:x.courseTitle,issuedAt:x.issuedAt,course:x.course})));
  }));
  // public: lets anyone verify a certificate by its ID
  app.get('/api/certificates/:certId',h(async(q,s)=>{
    if(!/^LS-[0-9A-F]{6}-[0-9A-F]{6}$/.test(q.params.certId))throw httpError(404,'Certificate not found.');
    const x=await Certificate.findOne({certId:q.params.certId});
    if(!x)throw httpError(404,'Certificate not found.');
    s.json({certId:x.certId,studentName:x.studentName,courseTitle:x.courseTitle,instructorName:x.instructorName,issuedAt:x.issuedAt,progress:x.progress,quizPercent:x.quizPercent});
  }));

  /* ===== certificate as a real PDF download (public, like verification) ===== */
  app.get('/api/certificates/:certId/pdf',h(async(q,s)=>{
    if(!/^LS-[0-9A-F]{6}-[0-9A-F]{6}$/.test(q.params.certId))throw httpError(404,'Certificate not found.');
    const x=await Certificate.findOne({certId:q.params.certId});
    if(!x)throw httpError(404,'Certificate not found.');
    streamCertificate(s,x,`${(process.env.CLIENT_URL||'http://localhost:5173').replace(/\/$/,'')}/certificate/${x.certId}`);
  }));

  /* ===== admin / instructor: who enrolled in a course ===== */
  const studentRows=async(c)=>{
    const [es,certs,attempts]=await Promise.all([
      Enrollment.find({course:c._id}).populate('student','name email').sort({createdAt:-1}),
      Certificate.find({course:c._id},'student certId'),
      QuizAttempt.find({course:c._id,status:{$ne:'in_progress'}},'student percent passed')]);
    const total=c.lessons.length;
    return es.filter(e=>e.student).map(e=>{
      const sid=String(e.student._id);
      const mine=attempts.filter(a=>String(a.student)===sid);
      return {id:e._id,name:e.student.name,email:e.student.email,enrolledAt:e.createdAt,lastActive:e.updatedAt,
        completedLessons:e.completedLessons.length,totalLessons:total,progress:total?Math.round(e.completedLessons.length/total*100):0,
        certificate:certs.some(x=>String(x.student)===sid),
        quizBest:mine.length?Math.max(...mine.map(a=>a.percent||0)):null,quizPassed:mine.some(a=>a.passed)};
    });
  };
  app.get('/api/admin/courses/:id/students',auth,roles('admin','instructor'),h(async(q,s)=>{
    const c=await ownCourse(q);
    const students=await studentRows(c);
    s.json({course:{_id:c._id,title:c.title,lessons:c.lessons.length},count:students.length,students});
  }));
  const csvCell=v=>{let t=String(v??'');if(/^[=+\-@\t\r]/.test(t))t="'"+t;return `"${t.replace(/"/g,'""')}"`};
  app.get('/api/admin/courses/:id/students.csv',auth,roles('admin','instructor'),h(async(q,s)=>{
    const c=await ownCourse(q);
    const rows=await studentRows(c);
    const head=['Name','Email','Enrolled on','Progress %','Lessons completed','Certificate','Quiz best %','Quiz passed','Last active'];
    const lines=[head,...rows.map(r=>[r.name,r.email,new Date(r.enrolledAt).toISOString().slice(0,10),r.progress,`${r.completedLessons}/${r.totalLessons}`,r.certificate?'Yes':'No',r.quizBest??'',r.quizPassed?'Yes':'No',new Date(r.lastActive).toISOString().slice(0,10)])];
    s.setHeader('Content-Type','text/csv; charset=utf-8');
    s.setHeader('Content-Disposition',`attachment; filename="students-${c._id}.csv"`);
    s.send('\ufeff'+lines.map(l=>l.map(csvCell).join(',')).join('\r\n'));
  }));

  /* ===== admin: email status + test ===== */
  app.get('/api/admin/email/status',auth,roles('admin'),h(async(q,s)=>{
    const me=await User.findById(q.user.id);
    s.json({...emailInfo(),adminEmail:me?.email,apiUrl:apiUrl()});
  }));
  app.post('/api/admin/email/test',auth,roles('admin'),h(async(q,s)=>{
    const me=await User.findById(q.user.id);
    const to=String(q.body?.to||me?.email||'').trim();
    if(!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(to))throw httpError(400,'Enter a valid email address.');
    const r=await mail.test({to});
    if(!r.ok)throw httpError(502,`Could not send: ${r.reason}`);
    s.json({message:r.printed?'Email is not set up yet, so the message was printed in the server terminal.':`Test email sent to ${to}.`,printed:!!r.printed});
  }));
}
