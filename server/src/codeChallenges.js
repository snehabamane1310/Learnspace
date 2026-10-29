import {Course,Enrollment,CodeAttempt} from './models.js';
import {executeLocal} from './localCompiler.js';

const bad=(status,message)=>Object.assign(new Error(message),{status});
const same=(a,b)=>String(a)===String(b);
const challengeUnlocked=(enrollment,lesson)=>{
  const duration=Number(lesson.durationSeconds)||0;
  const progress=enrollment.lessonProgress.find(x=>same(x.lesson,lesson._id));
  const watched=(progress?.ranges||[]).reduce((total,range)=>total+Math.max(0,Number(range.e)-Number(range.s)),0);
  return duration>0&&watched>=duration*0.75;
};
const fallback=(course)=>{
  const name=(course.title+' '+course.category).toLowerCase();
  const language=name.includes('python')?'python':name.includes('c++')||name.includes('cpp')?'c++':name.includes('java')?'java':name.includes('c language')?'c':'javascript';
  const starter={
    javascript:'const fs = require("fs");\nconst n = Number(fs.readFileSync(0, "utf8").trim());\nconsole.log(n * n);',
    python:'n = int(input())\nprint(n * n)',
    c:'#include <stdio.h>\nint main(){ int n; scanf("%d", &n); printf("%d\\n", n*n); return 0; }',
    'c++':'#include <iostream>\nint main(){ int n; std::cin >> n; std::cout << n*n << std::endl; }',
    java:'import java.util.*;\npublic class Main { public static void main(String[] args){ Scanner s=new Scanner(System.in); int n=s.nextInt(); System.out.println(n*n); } }'
  };
  return {title:'Coding check: square a number',prompt:'Read one integer from standard input and print its square. Write only the answer to standard output.',language,starterCode:starter[language],sampleInput:'5\n',sampleOutput:'25',tests:[{input:'5\n',expected:'25'},{input:'-3\n',expected:'9'},{input:'12\n',expected:'144'}]};
};
const challengeOf=(lesson,course)=>{
  const saved=lesson.codingChallenge?.toObject?.()||lesson.codingChallenge||{};
  const d=fallback(course);
  const custom=Boolean(saved.tests?.length);
  return {...d,...saved,language:custom?saved.language:d.language,starterCode:custom?saved.starterCode:d.starterCode,
    tests:custom?saved.tests.map(t=>({input:t.input||'',expected:t.expected||''})):d.tests};
};
const publicChallenge=c=>({title:c.title,prompt:c.prompt,language:c.language,starterCode:c.starterCode,sampleInput:c.sampleInput,sampleOutput:c.sampleOutput});

export function registerCodeChallengeRoutes(app,{auth,roles,run}){
  const h=fn=>run(async(q,s)=>{try{await fn(q,s)}catch(e){if(e.status)return s.status(e.status).json({message:e.message});throw e}});
  const getContext=async(q)=>{
    const a=await CodeAttempt.findOne({_id:q.params.attemptId,student:q.user.id});
    if(!a)throw bad(404,'Coding attempt not found.');
    const enrollment=await Enrollment.findOne({student:q.user.id,course:a.course});
    const course=await Course.findOne({_id:a.course,published:true});
    const lesson=course?.lessons.id(a.lesson);
    if(!enrollment||!lesson)throw bad(404,'Course lesson not found.');
    return {a,enrollment,course,lesson,challenge:challengeOf(lesson,course)};
  };
  const execute=async(language,code,input)=>{
    if((process.env.CODE_RUNNER_MODE||'piston').toLowerCase()==='local')return executeLocal(language,code,input);
    const base=(process.env.CODE_RUNNER_URL||'http://localhost:2000/api/v2').replace(/\/$/,'');
    let r;
    try{r=await fetch(base+'/execute',{method:'POST',headers:{'content-type':'application/json'},signal:AbortSignal.timeout(15000),
      body:JSON.stringify({language,version:'*',files:[{name:language==='java'?'Main.java':undefined,content:code}],stdin:input,
        compile_timeout:10000,run_timeout:3000,run_cpu_time:3000,run_memory_limit:134217728})})}
    catch{throw bad(503,'Code runner unavailable. Start the configured Piston service and try again.');}
    const data=await r.json().catch(()=>({}));
    if(!r.ok)throw bad(503,data.message||'Code runner rejected this request.');
    const stage=data.run||data.compile||{};
    return {output:String(stage.stdout||''),error:String(stage.stderr||stage.message||'').slice(0,1800),ok:!stage.status&&stage.code===0};
  };
  app.put('/api/admin/courses/:id/lessons/:lessonId/challenge',auth,roles('admin','instructor'),h(async(q,s)=>{
    const c=await Course.findById(q.params.id);
    if(!c)throw bad(404,'Course not found.');
    if(q.user.role!=='admin'&&String(c.instructor)!==q.user.id)throw bad(403,'You can only edit your own courses.');
    const l=c.lessons.id(q.params.lessonId);
    if(!l)throw bad(404,'Lesson not found.');
    const b=q.body||{},languages=['javascript','python','c','c++','java'];
    const tests=Array.isArray(b.tests)?b.tests:[];
    if(!languages.includes(b.language))throw bad(400,'Choose a supported programming language.');
    if(!String(b.title||'').trim()||!String(b.prompt||'').trim()||!String(b.starterCode||'').trim())throw bad(400,'Add a title, instructions and starter code.');
    if(!tests.length||tests.length>12||tests.some(t=>typeof t.input!=='string'||typeof t.expected!=='string'))throw bad(400,'Add 1 to 12 test cases with input and expected output.');
    l.codingChallenge={title:String(b.title).trim().slice(0,120),prompt:String(b.prompt).trim().slice(0,2000),language:b.language,
      starterCode:String(b.starterCode).slice(0,20000),sampleInput:String(b.sampleInput||'').slice(0,1000),sampleOutput:String(b.sampleOutput||'').slice(0,1000),
      tests:tests.map(t=>({input:t.input.slice(0,1000),expected:t.expected.slice(0,1000)}))};
    await c.save();await Enrollment.updateMany({course:c._id},{$pull:{passedCodeLessons:l._id}});s.json({message:'Coding challenge saved.'});
  }));
  app.get('/api/enrollments/:id/lessons/:lessonId/challenge',auth,roles('student'),h(async(q,s)=>{
    const e=await Enrollment.findOne({_id:q.params.id,student:q.user.id});
    if(!e)throw bad(404,'Enrollment not found.');
    const c=await Course.findOne({_id:e.course,published:true}),l=c?.lessons.id(q.params.lessonId);
    if(!l)throw bad(404,'Lesson not found.');
    if(!challengeUnlocked(e,l))throw bad(403,'Watch 75% of this video to unlock its coding test.');
    const [latest,best]=await Promise.all([
      CodeAttempt.findOne({student:q.user.id,course:c._id,lesson:l._id}).sort({createdAt:-1}),
      CodeAttempt.find({student:q.user.id,course:c._id,lesson:l._id,status:'submitted'}).sort({score:-1}).limit(1)
    ]);
    s.json({challenge:publicChallenge(challengeOf(l,c)),passed:(e.passedCodeLessons||[]).some(x=>same(x,l._id)),
      latest:latest?{score:latest.score,total:latest.total,passed:latest.passed,status:latest.status}:null,
      best:best[0]?{score:best[0].score,total:best[0].total,passed:best[0].passed}:null});
  }));
  app.post('/api/enrollments/:id/lessons/:lessonId/challenge/start',auth,roles('student'),h(async(q,s)=>{
    const e=await Enrollment.findOne({_id:q.params.id,student:q.user.id});
    if(!e)throw bad(404,'Enrollment not found.');
    const c=await Course.findOne({_id:e.course,published:true}),l=c?.lessons.id(q.params.lessonId);
    if(!l)throw bad(404,'Lesson not found.');
    if(!challengeUnlocked(e,l))throw bad(403,'Watch 75% of this video to unlock its coding test.');
    const index=c.lessons.findIndex(x=>same(x._id,l._id));
    if(index>0&&!((e.passedCodeLessons||[]).some(x=>same(x,c.lessons[index-1]._id))))throw bad(403,'Pass the previous video coding test first.');
    const challenge=challengeOf(l,c),a=await CodeAttempt.create({student:q.user.id,course:c._id,lesson:l._id});
    s.status(201).json({attemptId:a._id,challenge:publicChallenge(challenge)});
  }));
  app.post('/api/code-attempts/:attemptId/run',auth,roles('student'),h(async(q,s)=>{
    const {a,challenge}=await getContext(q);
    if(a.status!=='in_progress')throw bad(409,'This coding attempt has ended.');
    const code=String(q.body.code||'');
    if(!code.trim()||code.length>20000)throw bad(400,'Enter code under 20,000 characters.');
    const r=await execute(challenge.language,code,challenge.sampleInput||'');s.json({output:r.output,error:r.error,ok:r.ok});
  }));
  app.post('/api/code-attempts/:attemptId/submit',auth,roles('student'),h(async(q,s)=>{
    const {a,enrollment,lesson,challenge}=await getContext(q);
    if(a.status!=='in_progress')return s.json({score:a.score,total:a.total,passed:a.passed,status:a.status});
    const code=String(q.body.code||'');
    if(!code.trim()||code.length>20000)throw bad(400,'Enter code under 20,000 characters.');
    const results=[];
    for(const [index,t] of challenge.tests.entries()){
      const r=await execute(challenge.language,code,t.input||'');
      results.push({number:index+1,passed:r.ok&&r.output.trim()===String(t.expected||'').trim(),error:r.ok?'':r.error});
    }
    const score=results.filter(x=>x.passed).length,total=results.length,passed=score===total;
    const saved=await CodeAttempt.findOneAndUpdate({_id:a._id,status:'in_progress'},{$set:{status:'submitted',score,total,passed,submittedAt:new Date()}},{new:true});
    if(!saved){const latest=await CodeAttempt.findById(a._id);return s.json({score:latest?.score||0,total:latest?.total||0,passed:false,status:latest?.status||'terminated'})}
    if(passed&&!(enrollment.passedCodeLessons||[]).some(x=>same(x,lesson._id))){enrollment.passedCodeLessons.push(lesson._id);await enrollment.save()}
    s.json({score,total,percent:Math.round(score/total*100),passed,results});
  }));
  app.post('/api/code-attempts/:attemptId/violation',auth,roles('student'),h(async(q,s)=>{
    const {a}=await getContext(q);
    if(a.status==='in_progress'){a.status='terminated';a.violation=String(q.body.type||'integrity violation').slice(0,40);a.score=0;a.total=0;a.passed=false;a.submittedAt=new Date();await a.save()}
    s.json({terminated:true,score:a.score,total:a.total,passed:false});
  }));
}
