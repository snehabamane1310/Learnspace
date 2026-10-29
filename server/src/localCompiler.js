// Local development runner for native toolchains. This is NOT a sandbox.
import {spawn} from 'node:child_process';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';

const MAX_OUTPUT=128*1024;
const COMPILE_LIMIT_MS=10000;
const RUN_LIMIT_MS=5000;
const tool=(key,fallback)=>process.env[key]||fallback;

function startError(command,error){
  if(error?.code==='ENOENT')return `Required tool "${command}" was not found. Install it, add it to PATH, and restart LearnSpace.`;
  return `Could not start "${command}": ${error?.message||'process error'}`;
}

function runProcess(command,args,cwd,stdin,timeoutMs){
  return new Promise(resolve=>{
    let stdout='',stderr='',outBytes=0,errBytes=0,timedOut=false,tooMuchOutput=false,closed=false;
    let child;
    try{child=spawn(command,args,{cwd,shell:false,windowsHide:true,stdio:['pipe','pipe','pipe']})}
    catch(error){resolve({stdout,stderr:startError(command,error),code:-1,timedOut:false,tooMuchOutput:false});return}
    const append=(which,chunk)=>{
      const value=chunk.toString('utf8');
      if(which==='stdout'){
        const room=MAX_OUTPUT-outBytes;if(room>0)stdout+=value.slice(0,room);
        outBytes+=Buffer.byteLength(value);if(outBytes>MAX_OUTPUT)tooMuchOutput=true;
      }else{
        const room=MAX_OUTPUT-errBytes;if(room>0)stderr+=value.slice(0,room);
        errBytes+=Buffer.byteLength(value);if(errBytes>MAX_OUTPUT)tooMuchOutput=true;
      }
      if(tooMuchOutput&&!closed)child.kill();
    };
    child.stdout.on('data',chunk=>append('stdout',chunk));
    child.stderr.on('data',chunk=>append('stderr',chunk));
    child.stdin.on('error',()=>{});
    const timer=setTimeout(()=>{timedOut=true;child.kill()},timeoutMs);
    child.once('error',error=>{
      if(closed)return;closed=true;clearTimeout(timer);stderr=startError(command,error);
      resolve({stdout,stderr,code:-1,timedOut,tooMuchOutput});
    });
    child.once('close',code=>{
      if(closed)return;closed=true;clearTimeout(timer);resolve({stdout,stderr,code,timedOut,tooMuchOutput});
    });
    try{child.stdin.end(String(stdin||''))}catch{}
  });
}

const compileError=r=>r.timedOut?'Compilation exceeded the 10-second limit.':r.tooMuchOutput?'Compiler output exceeded 128 KB.':r.stderr||r.stdout||`Compiler exited with code ${r.code}.`;
function programResult(r){
  if(r.timedOut)return {output:r.stdout,error:'Program stopped after exceeding the 5-second run limit.',ok:false};
  if(r.tooMuchOutput)return {output:r.stdout,error:'Program stopped after exceeding 128 KB of output.',ok:false};
  return {output:r.stdout,error:r.code===0?'':(r.stderr||`Program exited with code ${r.code}.`),ok:r.code===0};
}

export async function executeLocal(language,code,input=''){
  if(!['javascript','python','c','c++','java'].includes(language))return {output:'',error:`Unsupported language: ${language}`,ok:false};
  if(typeof code!=='string'||code.length>20000)return {output:'',error:'Code must be under 20,000 characters.',ok:false};
  if(String(input).length>5000)return {output:'',error:'Test input must be under 5,000 characters.',ok:false};
  const dir=await mkdtemp(join(tmpdir(),'learnspace-code-'));
  try{
    const ext={javascript:'js',python:'py',c:'c','c++':'cpp',java:'java'}[language];
    const source=join(dir,language==='java'?'Main.java':`main.${ext}`);
    await writeFile(source,code,{encoding:'utf8',flag:'wx'});
    let command,args=[];
    if(language==='javascript'){
      command=process.execPath;args=[source];
    }else if(language==='python'){
      command=tool('LOCAL_PYTHON_CMD','python');args=['-I',source];
    }else if(language==='c'||language==='c++'){
      command=language==='c'?tool('LOCAL_C_COMPILER','gcc'):tool('LOCAL_CPP_COMPILER','g++');
      const exe=join(dir,process.platform==='win32'?'main.exe':'main');
      const flags=language==='c++'?['-std=c++17','-O0']:['-O0'];
      const compiled=await runProcess(command,[...flags,source,'-o',exe],dir,'',COMPILE_LIMIT_MS);
      if(compiled.code!==0||compiled.timedOut||compiled.tooMuchOutput)return {output:'',error:compileError(compiled),ok:false};
      command=exe;args=[];
    }else{
      command=tool('LOCAL_JAVAC_CMD','javac');
      const compiled=await runProcess(command,['-d',dir,source],dir,'',COMPILE_LIMIT_MS);
      if(compiled.code!==0||compiled.timedOut||compiled.tooMuchOutput)return {output:'',error:compileError(compiled),ok:false};
      command=tool('LOCAL_JAVA_CMD','java');args=['-cp',dir,'Main'];
    }
    return programResult(await runProcess(command,args,dir,input,RUN_LIMIT_MS));
  }catch(error){
    return {output:'',error:`Local compiler error: ${error.message||'could not prepare a temporary run folder.'}`,ok:false};
  }finally{
    await rm(dir,{recursive:true,force:true,maxRetries:2}).catch(()=>{});
  }
}
