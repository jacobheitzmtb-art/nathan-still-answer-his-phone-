import {mkdir,rm,stat} from 'node:fs/promises';
import path from 'node:path';
import {ROOT,FFMPEG,LIMIT,UserError,run} from './lib.mjs';
import {saveMedia} from './network.mjs';

// Prefer a native rendition at the requested resolution. Never upscale.
export function selectPlan(record,quality){
  const formats=record.formats;
  const videos=formats.filter(f=>f.vcodec!=='none').sort((a,b)=>(b.width||0)*(b.height||0)-(a.width||0)*(a.height||0)||(b.tbr||0)-(a.tbr||0));
  const audio=formats.filter(f=>f.vcodec==='none'&&f.acodec&&f.acodec!=='none').sort((a,b)=>(b.abr||b.tbr||0)-(a.abr||a.tbr||0))[0];
  if(quality==='audio')return{video:audio||videos.find(f=>f.acodec!=='none')||videos[0],audio:null,transcode:false,audioOnly:true};
  const exact=quality==='best'?videos[0]:videos.filter(f=>Math.min(f.width||0,f.height||0)===Number(quality)).sort((a,b)=>(b.tbr||0)-(a.tbr||0))[0];
  const video=exact||videos[0];
  if(!video)throw new UserError('No usable video stream was found.');
  return{video,audio:video.acodec==='none'?audio:null,transcode:!exact,audioOnly:false};
}

export function singleFlight(map,key,work){
  if(map.has(key))return map.get(key);
  const pending=Promise.resolve().then(work);map.set(key,pending);
  pending.catch(()=>{if(map.get(key)===pending)map.delete(key);});
  return pending;
}

async function input(record,format){
  record.inputs??=new Map();
  return singleFlight(record.inputs,format.url,async()=>{
    const dir=path.join(ROOT,'.cache',record.id);await mkdir(dir,{recursive:true});
    const file=path.join(dir,`input-${record.nextInput=(record.nextInput||0)+1}.mp4`);
    try{await saveMedia(format.url,file,record.previewAgent);return file;}catch(error){await rm(file,{force:true});throw error;}
  });
}

export async function processMedia(record,job,progress){
  const plan=selectPlan(record,job.quality),started=performance.now();
  const transfers=[input(record,plan.video)];if(plan.audio)transfers.push(input(record,plan.audio));
  const settled=await Promise.allSettled(transfers);for(const value of settled)if(value.status==='rejected')throw value.reason;
  const inputs=settled.map(v=>v.value);const fetched=performance.now();
  const sizes=await Promise.all(inputs.map(f=>stat(f)));if(sizes.reduce((n,s)=>n+s.size,0)>LIMIT)throw new UserError('The source exceeds the 250 MB limit.');
  record.inspections??=new Map();
  const inspected=await singleFlight(record.inspections,inputs[0],async()=>{
    const {stderr}=await run(FFMPEG,['-hide_banner','-nostdin','-i',inputs[0],'-t','0','-f','null','-'],{timeout:15000});
    const m=stderr.match(/Duration: (\d+):(\d+):([\d.]+)/);
    if(!m)throw new UserError('The media duration could not be verified.');
    if(Number(m[1])*3600+Number(m[2])*60+Number(m[3])>1200)throw new UserError('This version supports videos up to 20 minutes.');
    return stderr;
  });
  if(plan.audioOnly&&!/Audio:/.test(inspected))throw new UserError('No audio is available for this video.');
  progress(plan.audioOnly?'Preparing your audio…':plan.transcode?`Creating the ${job.quality}p file…`:'Packaging the original streams…');
  const args=['-hide_banner','-loglevel','error','-nostdin','-y','-i',inputs[0]];
  if(inputs[1])args.push('-i',inputs[1]);
  if(plan.audioOnly)args.push('-map','0:a:0','-vn','-c:a','libmp3lame','-b:a','192k');
  else{
    args.push('-map','0:v:0','-map',inputs[1]?'1:a:0':'0:a:0?');
    if(plan.transcode)args.push('-vf',`scale=w='if(gte(iw,ih),-2,min(${job.quality},iw))':h='if(gte(iw,ih),min(${job.quality},ih),-2)':force_divisible_by=2`,'-c:v','libx264','-preset','veryfast','-crf','20','-threads','2','-c:a','aac','-b:a','192k');
    else args.push('-c','copy');
    args.push('-movflags','+faststart');
  }
  args.push('-fs',String(LIMIT),job.file);await run(FFMPEG,args,{timeout:480000});
  if((await stat(job.file)).size>=LIMIT)throw new UserError('The prepared file exceeds the 250 MB limit.');
  job.timings={transferMs:Math.round(fetched-started),processingMs:Math.round(performance.now()-fetched),totalMs:Math.round(performance.now()-started),native:!plan.transcode};
}
