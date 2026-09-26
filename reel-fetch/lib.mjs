import {spawn} from 'node:child_process';
import {readFile,stat} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
export const ROOT=path.dirname(fileURLToPath(import.meta.url));
let config={};try{config=JSON.parse((await readFile(path.join(ROOT,'.local-config.json'),'utf8')).replace(/^\uFEFF/,''));}catch{}
export const PYTHON=process.env.PYTHON||config.python||'python';
export const FFMPEG=process.env.FFMPEG_PATH||config.ffmpeg||'ffmpeg';
export const LIMIT=250*1024*1024;
export class UserError extends Error{constructor(message,status=400){super(message);this.status=status;}}
export function canonicalUrl(value){
  if(typeof value!=='string'||value.length>2048)throw new UserError('Paste a valid Instagram video or reel link.');
  let u;try{u=new URL(value);}catch{throw new UserError('Paste a complete Instagram URL starting with https://.');}
  if(!['https:','http:'].includes(u.protocol)||!['instagram.com','www.instagram.com','m.instagram.com'].includes(u.hostname)||u.username||u.password||u.port)throw new UserError('Use a link from instagram.com. Other websites are not supported.');
  const m=u.pathname.match(/^\/(p|reel|reels|tv)\/([A-Za-z0-9_-]{5,40})\/?$/);
  if(!m)throw new UserError('Use a public post or reel link, rather than a profile, story, or shared redirect.');
  return `https://www.instagram.com/${m[1]==='reels'?'reel':m[1]}/${m[2]}/`;
}
export function qualitiesFor(width,height,audio){
  const out=[{value:'best',label:'Best available',description:'Original quality · MP4'}],short=Math.min(width||0,height||0);
  for(const p of [1080,720,360])if(short>=p)out.push({value:String(p),label:`${p}p`,description:'MP4 · '+(short===p?'Source size':'Smaller file')});
  if(audio)out.push({value:'audio',label:'Audio only',description:'MP3 · 192 kbps'});
  return out;
}
export function parseRange(range,size){
  if(!range)return null;
  const m=/^bytes=(\d*)-(\d*)$/.exec(range);
  if(!m||(!m[1]&&!m[2]))throw new UserError('Invalid byte range.',416);
  const start=m[1]?Number(m[1]):Math.max(0,size-Number(m[2]));
  const end=m[1]?(m[2]?Math.min(Number(m[2]),size-1):size-1):size-1;
  if(!Number.isSafeInteger(start)||!Number.isSafeInteger(end)||start<0||start>=size||end<start)throw new UserError('Requested range is unavailable.',416);
  return{start,end};
}
export function run(command,args,{timeout=120000,maxOutput=12*1024*1024}={}){
  return new Promise((resolve,reject)=>{
    const child=spawn(command,args,{cwd:ROOT,windowsHide:true,shell:false,env:{...process.env,PYTHONPATH:path.join(ROOT,'.vendor'),PYTHONIOENCODING:'utf-8'}});
    let stdout='',stderr='',failure=null;
    const timer=setTimeout(()=>{failure=new Error('The request timed out.');child.kill();},timeout);
    child.stdout.on('data',d=>{stdout+=d.toString();if(stdout.length>maxOutput){failure=new Error('The source returned too much data.');child.kill();}});
    child.stderr.on('data',d=>{stderr=(stderr+d.toString()).slice(-18000);});
    child.on('error',error=>{clearTimeout(timer);reject(error);});
    child.on('close',code=>{clearTimeout(timer);if(failure)reject(failure);else if(code!==0)reject(new Error(stderr||`Process exited with code ${code}`));else resolve({stdout,stderr});});
  });
}
export const dlpBase=['-m','yt_dlp','--ignore-config','--no-cache-dir','--no-warnings','--no-playlist','--playlist-items','1','--socket-timeout','20','--retries','1','--extractor-retries','1','--use-extractors','Instagram'];
export function userMessage(error){
  const t=error.message||'';if(error instanceof UserError)return t;
  if(/login|log in|private|rate.limit|unavailable|not available|unable to extract|requested content/i.test(t))return 'Instagram did not provide this public video. It may require login, be restricted, or be temporarily blocked. Try another public link or try again later.';
  if(/ENOENT|No module named|not found/i.test(t))return 'The download tools are not installed. Follow the setup steps in the project README.';
  if(/timed out|timeout/i.test(t))return 'Instagram took too long to respond. Please try again shortly.';
  if(/format is not available|does not contain any stream|matches no streams/i.test(t))return 'The requested video or audio format is not available for this post.';
  return 'The video could not be processed. Try another public video or try again later.';
}
export async function convert(input,output,quality){
  if(!['best','audio','1080','720','360'].includes(quality))throw new UserError('Unsupported quality.');
  const args=['-hide_banner','-loglevel','error','-nostdin','-y','-i',input];
  if(quality==='audio')args.push('-vn','-map','0:a:0','-c:a','libmp3lame','-b:a','192k');
  else if(quality==='best')args.push('-map','0:v:0','-map','0:a:0?','-c','copy','-movflags','+faststart');
  else args.push('-map','0:v:0','-map','0:a:0?','-vf',`scale=w='if(gte(iw,ih),-2,min(${quality},iw))':h='if(gte(iw,ih),min(${quality},ih),-2)':force_divisible_by=2`,'-c:v','libx264','-preset','fast','-crf','20','-c:a','aac','-b:a','192k','-movflags','+faststart');
  args.push('-fs',String(LIMIT),output);await run(FFMPEG,args,{timeout:480000});
  if((await stat(output)).size>=LIMIT)throw new UserError('The prepared file exceeds the 250 MB limit.');
}
