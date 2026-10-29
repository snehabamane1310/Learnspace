import React,{useEffect,useRef,useState} from 'react';
import {FastForward,Maximize,Pause,Play,RotateCcw} from 'lucide-react';
import {api} from './api.js';

/* ---- YouTube IFrame API loader ---- */
let ytReady=null;
export function loadYT(){
  if(window.YT&&window.YT.Player)return Promise.resolve(window.YT);
  if(!ytReady)ytReady=new Promise((resolve,reject)=>{
    const prev=window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady=()=>{prev&&prev();resolve(window.YT)};
    const s=document.createElement('script');
    s.src='https://www.youtube.com/iframe_api';
    s.onerror=()=>{ytReady=null;reject(new Error('YouTube player could not be loaded'))};
    document.head.appendChild(s);
  });
  return ytReady;
}
const fmt=t=>{t=Math.max(0,Math.floor(t||0));return `${Math.floor(t/60)}:${String(t%60).padStart(2,'0')}`};

/* ---- Student player: no seek bar, no skipping, reports real watch time to the server ---- */
export default function VideoPlayer({lesson,enrollmentId,stat,onProgress}){
  const box=useRef(null),wrap=useRef(null),player=useRef(null);
  const allowed=useRef(stat.frontier||0);        // furthest point the student may be at
  const done=useRef(stat.completed);
  const cb=useRef(onProgress);cb.current=onProgress;
  const [state,setState]=useState('loading');     // loading | ready | playing | paused | ended | error
  const [time,setTime]=useState(stat.frontier||0);
  const [dur,setDur]=useState(stat.duration||0);
  const [msg,setMsg]=useState('');
  useEffect(()=>{done.current=stat.completed},[stat.completed]);

  useEffect(()=>{
    let dead=false,tick=null,beatTimer=null,p=null;
    const el=document.createElement('div');
    box.current.appendChild(el);

    const send=async(playing)=>{
      if(!p||!p.getCurrentTime||done.current)return;
      try{
        const {data}=await api.post(`/enrollments/${enrollmentId}/watch`,{lessonId:lesson._id,position:p.getCurrentTime(),playing});
        if(!dead)cb.current(data);
      }catch(e){
        const m=e.response?.data?.message;
        if(m&&!/Busy/.test(m)&&!dead)setMsg(m);
      }
    };

    loadYT().then(YT=>{
      if(dead)return;
      p=new YT.Player(el,{
        videoId:lesson.youtubeId,
        host:'https://www.youtube-nocookie.com',
        playerVars:{controls:0,disablekb:1,rel:0,modestbranding:1,playsinline:1,fs:0,iv_load_policy:3,
          start:Math.floor(stat.frontier||0),origin:window.location.origin},
        events:{
          onReady:()=>{if(dead)return;player.current=p;setDur(stat.duration||p.getDuration()||0);setState('ready')},
          onStateChange:ev=>{
            if(dead)return;
            const S=window.YT.PlayerState;
            clearInterval(beatTimer);
            if(ev.data===S.PLAYING){setState('playing');setMsg('');send(true);beatTimer=setInterval(()=>send(true),5000)}
            else if(ev.data===S.PAUSED){setState('paused');send(false)}
            else if(ev.data===S.ENDED){setState('ended');send(false)}
          },
          onError:()=>{if(!dead)setState('error')}
        }
      });
    }).catch(()=>{if(!dead)setState('error')});

    // every 0.4s: undo any jump forward, force normal speed, update the clock
    tick=setInterval(()=>{
      if(!p||!p.getCurrentTime||!player.current)return;
      const t=p.getCurrentTime();
      if(!done.current){
        if(t>allowed.current+2){p.seekTo(allowed.current,true);setMsg('Forward moves are limited to 10 seconds. Any skipped time still has to be watched for progress.')}
        else if(t>allowed.current)allowed.current=t;
      }
      if(p.getPlaybackRate&&p.getPlaybackRate()!==1)p.setPlaybackRate(1);
      setTime(t);
    },400);

    // leaving the tab pauses the video, so only attentive watching counts
    const onVis=()=>{
      if(document.hidden&&p&&p.getPlayerState&&p.getPlayerState()===1){
        p.pauseVideo();setMsg('Paused because you left this tab. Press play to continue.');
      }
    };
    document.addEventListener('visibilitychange',onVis);

    return()=>{
      dead=true;clearInterval(tick);clearInterval(beatTimer);
      document.removeEventListener('visibilitychange',onVis);
      try{ // final beat when switching lessons / leaving the page
        if(p&&p.getCurrentTime&&p.getPlayerState()===1&&!done.current)
          api.post(`/enrollments/${enrollmentId}/watch`,{lessonId:lesson._id,position:p.getCurrentTime(),playing:false}).catch(()=>{});
      }catch{}
      try{p&&p.destroy()}catch{}
      if(box.current)box.current.innerHTML='';
    };
  },[lesson._id,enrollmentId]);

  const playing=state==='playing';
  const toggle=()=>{const p=player.current;if(!p||state==='error')return;playing?p.pauseVideo():p.playVideo()};
  const back=()=>{const p=player.current;if(p)p.seekTo(Math.max(0,p.getCurrentTime()-10),true)};
  const forward=()=>{const p=player.current;if(p){const target=Math.min(dur||p.getDuration()||Infinity,p.getCurrentTime()+10);allowed.current=Math.max(allowed.current,target);p.seekTo(target,true)}};
  const full=()=>{const w=wrap.current;if(!document.fullscreenElement)w?.requestFullscreen?.();else document.exitFullscreen?.()};
  const watched=stat.completed?100:stat.percent;
  const now=dur?Math.min(100,time/dur*100):0;

  return <div className="vp" ref={wrap}>
    <div className="vp-frame">
      <div className="vp-host" ref={box}/>
      <div className="vp-shield" onClick={toggle} onContextMenu={e=>e.preventDefault()}>
        {state==='loading'&&<span className="vp-pill">Loading player…</span>}
        {state==='error'&&<span className="vp-pill err">This video cannot be played. It may be private or have embedding turned off. Tell your instructor.</span>}
        {(state==='ready'||state==='paused')&&<span className="vp-bigplay"><Play size={30} fill="currentColor"/></span>}
        {state==='ended'&&<span className="vp-pill">{stat.completed?'Lesson completed ✓':'Finished — checking your progress…'}</span>}
      </div>
    </div>
    <div className="vp-bar">
      <button type="button" onClick={toggle} title={playing?'Pause':'Play'}>{playing?<Pause size={17}/>:<Play size={17}/>}</button>
      <button type="button" onClick={back} title="Back 10 seconds"><RotateCcw size={16}/></button>
      <button type="button" onClick={forward} title="Forward 10 seconds"><FastForward size={16}/></button>
      <span className="vp-time">{fmt(time)} / {fmt(dur)}</span>
      <div className="vp-track" title="Move in 10-second steps">
        <i className="vp-watched" style={{width:watched+'%'}}/>
        <i className="vp-now" style={{left:now+'%'}}/>
      </div>
      <button type="button" onClick={full} title="Full screen"><Maximize size={16}/></button>
    </div>
    <div className="vp-note">{msg||(stat.completed?'✓ Lesson completed. You can rewatch it freely.':'Use the 10-second buttons to move backward or forward. Every second still has to be watched for progress.')}</div>
  </div>;
}

/* ---- Studio helper: reads each video's real length once (needs no API key) ---- */
export function AutoDuration({course,onDone}){
  const host=useRef(null),tried=useRef(new Set());
  const [status,setStatus]=useState('');
  const next=course.lessons.find(l=>!l.durationSeconds&&l.youtubeId&&!tried.current.has(l._id));
  const key=next?._id||'';

  useEffect(()=>{
    if(!next)return;
    let dead=false,iv=null,p=null;
    setStatus(`Detecting the video length of “${next.title}”…`);
    const el=document.createElement('div');
    host.current.appendChild(el);
    const finish=async(secs)=>{
      tried.current.add(next._id);
      if(secs>0){try{await api.patch(`/admin/courses/${course._id}/lessons/${next._id}`,{durationSeconds:Math.round(secs)})}catch{}}
      if(secs<=0)setStatus(`Could not detect the length of “${next.title}”. Check that the video exists and allows embedding, then re-save the lesson.`);
      else if(!dead)setStatus('');
      if(!dead)onDone();
    };
    loadYT().then(YT=>{
      if(dead)return;
      let tries=0;
      p=new YT.Player(el,{
        videoId:next.youtubeId,host:'https://www.youtube-nocookie.com',
        playerVars:{controls:0,origin:window.location.origin},
        events:{
          onReady:()=>{
            p.mute();p.playVideo(); // metadata (length) is only known once playback starts; muted + paused again right away
            iv=setInterval(()=>{
              tries++;
              const d=(p.getDuration&&p.getDuration())||0;
              if(d>0){clearInterval(iv);try{p.stopVideo()}catch{}finish(d)}
              else if(tries>40){clearInterval(iv);finish(0)}
            },500);
          },
          onError:()=>{clearInterval(iv);finish(0)}
        }
      });
    }).catch(()=>finish(0));
    return()=>{dead=true;clearInterval(iv);try{p&&p.destroy()}catch{}if(host.current)host.current.innerHTML=''};
  },[key]);

  return <>
    <div ref={host} style={{position:'fixed',left:-9999,top:0,width:320,height:200,overflow:'hidden'}} aria-hidden="true"/>
    {status&&<div className="st-notice">{status}</div>}
  </>;
}
