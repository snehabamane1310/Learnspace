import React,{useEffect,useState} from 'react';
import {Code2,Save} from 'lucide-react';
import {api,err} from './api.js';

const starters={
  javascript:'const fs = require("fs");\nconst n = Number(fs.readFileSync(0, "utf8").trim());\nconsole.log(n * n);',
  python:'n = int(input())\nprint(n * n)',
  c:'#include <stdio.h>\nint main(){ int n; scanf("%d", &n); printf("%d\\n", n*n); return 0; }',
  'c++':'#include <iostream>\nint main(){ int n; std::cin >> n; std::cout << n*n << std::endl; }',
  java:'import java.util.*;\npublic class Main { public static void main(String[] args){ Scanner s=new Scanner(System.in); int n=s.nextInt(); System.out.println(n*n); } }'
};
const cases=[{input:'5\n',expected:'25'},{input:'-3\n',expected:'9'},{input:'12\n',expected:'144'}];
export default function CodingChallengePanel({course}){
  const [lessonId,setLessonId]=useState(course.lessons[0]?._id||''),[form,setForm]=useState(null),[busy,setBusy]=useState(false),[notice,setNotice]=useState('');
  const lesson=course.lessons.find(x=>x._id===lessonId);
  useEffect(()=>{if(!course.lessons.some(x=>x._id===lessonId))setLessonId(course.lessons[0]?._id||'')},[course._id,course.lessons.length]);
  useEffect(()=>{
    if(!lesson){setForm(null);return}
    const old=lesson.codingChallenge||{};
    const name=course.title.toLowerCase();const language=old.tests?.length?old.language:name.includes('python')?'python':name.includes('c++')?'c++':name.includes('java')?'java':'javascript';
    setForm({title:old.title||'Coding check: square a number',prompt:old.prompt||'Read one integer from standard input and print its square. Write only the answer.',
      language,starterCode:old.tests?.length?old.starterCode:starters[language],sampleInput:old.sampleInput||'5\n',sampleOutput:old.sampleOutput||'25',
      tests:JSON.stringify(old.tests?.length?old.tests:cases,null,2)});
    setNotice('');
  },[lessonId,course._id,course.title]);
  async function save(e){
    e.preventDefault();setBusy(true);setNotice('');
    try{
      let tests;try{tests=JSON.parse(form.tests)}catch{throw new Error('Test cases must be valid JSON.')}
      if(!Array.isArray(tests))throw new Error('Test cases must be a JSON array.');
      await api.put('/admin/courses/'+course._id+'/lessons/'+lessonId+'/challenge',{...form,tests});
      setNotice('Coding test saved for this video.');
    }catch(x){setNotice(x.response?err(x):x.message)}finally{setBusy(false)}
  }
  if(!course.lessons.length)return <div className="codestudio"><b>Video coding tests</b><p>Add a video lesson first, then set its coding test here.</p></div>;
  return <section className="codestudio">
    <div className="lessonmanagerhead"><div><b><Code2 size={16}/> Coding test after every video</b><small>Choose a lesson and set its instructions, language and hidden tests.</small></div>
      <select value={lessonId} onChange={e=>setLessonId(e.target.value)}>{course.lessons.map((x,i)=><option value={x._id} key={x._id}>Video {i+1}: {x.title}</option>)}</select>
    </div>
    {form&&<form onSubmit={save} className="codechallenge-form">
      <label>Test title<input required value={form.title} onChange={e=>setForm({...form,title:e.target.value})}/></label>
      <label>Instructions<textarea required rows="3" value={form.prompt} onChange={e=>setForm({...form,prompt:e.target.value})}/></label>
      <label>Programming language<select value={form.language} onChange={e=>setForm({...form,language:e.target.value,starterCode:starters[e.target.value]})}>{['javascript','python','c','c++','java'].map(x=><option key={x}>{x}</option>)}</select></label>
      <label>Starter code<textarea className="codeeditor" rows="7" value={form.starterCode} onChange={e=>setForm({...form,starterCode:e.target.value})}/></label>
      <div className="formrow"><label>Sample input<textarea rows="2" value={form.sampleInput} onChange={e=>setForm({...form,sampleInput:e.target.value})}/></label><label>Sample output<textarea rows="2" value={form.sampleOutput} onChange={e=>setForm({...form,sampleOutput:e.target.value})}/></label></div>
      <label>Grading tests (JSON; keep these private)<textarea rows="7" value={form.tests} onChange={e=>setForm({...form,tests:e.target.value})} placeholder={'[{"input":"5","expected":"25"}]'}/></label>
      {notice&&<div className={notice.startsWith('Coding test saved')?'success':'notice'}>{notice}</div>}
      <button className="btn small" disabled={busy}><Save size={15}/>{busy?'Saving…':'Save coding test'}</button>
    </form>}
  </section>;
}
