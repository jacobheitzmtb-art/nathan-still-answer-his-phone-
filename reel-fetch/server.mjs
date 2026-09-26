import http from 'node:http';
import { readFile, mkdir, readdir, stat, rm } from 'node:fs/promises';
import {createReadStream} from 'node:fs';
import {randomBytes} from 'node:crypto';
import {pipeline} from 'node:stream/promises';
import {ROOT,PYTHON,UserError,canonicalUrl,qualitiesFor,parseRange,run,dlpBase,userMessage} from './lib.mjs';
import {openMedia,sizeLimit,mediaUrl} from './network.mjs';
import {render,pages,sitemap,robots} from './site.mjs';
import {processMedia,singleFlight} from './processing.mjs';
import {PORT,BIND_HOST,validateRequest,rateLimit,PUBLIC_ORIGIN} from './runtime.mjs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
const CACHE=path.join(ROOT,'.cache'),TTL=1800000;
const media=new Map(),jobs=new Map();let lookups=0,downloads=0;
const metadataCache=new Map(),metadataPending=new Map();
function publicMedia(record){const{id,url,title,uploader,width,height,duration,hasAudio,qualities,note}=record;return{id,url,title,uploader,width,height,duration,hasAudio,qualities,note};}
async function extract(url){
 const cached=metadataCache.get(url);if(cached&&Date.now()-cached.created<90000)return cached.raw;
 return singleFlight(metadataPending,url,async()=>{
  const {stdout}=await run(PYTHON,[...dlpBase,'--dump-single-json','--skip-download','--',url],{timeout:90000});
  const raw=JSON.parse(stdout);metadataCache.set(url,{created:Date.now(),raw});return raw;
 }).finally(()=>metadataPending.delete(url));
}
const token=()=>randomBytes(24).toString('hex');
async function search(value){
 const url=canonicalUrl(value);
 if((process.env.BLOCKED_SHORTCODES||'').split(',').map(s=>s.trim()).includes(new URL(url).pathname.split('/')[2]))throw new UserError('This source is unavailable through Reel Fetch.',403);
 if(lookups>=2)throw new UserError('Two videos are being checked. Please wait a moment.',429);
 if(media.size>=30)throw new UserError('The session limit has been reached. Try again after older sessions expire.',429);
 lookups++;
 try{
  const raw=await extract(url),info=raw.entries?raw.entries.find(e=>e&&e.formats?.some(f=>f.vcodec!=='none')):raw;
  if(!info)throw new UserError('This post does not contain a downloadable video.');
  const formats=(info.formats||[]).filter(f=>f.vcodec!=='none'&&f.url);
  if(!formats.length)throw new UserError('No downloadable video was found in this post.');
  if((info.duration||0)>1200)throw new UserError('This version supports videos up to 20 minutes.');
  formats.sort((a,b)=>((b.width||0)*(b.height||0)-(a.width||0)*(a.height||0))||((b.tbr||0)-(a.tbr||0)));
  const best=formats[0],width=best.width||info.width||0,height=best.height||info.height||0;
  const hasAudio=formats.some(f=>f.acodec!=='none')||(info.formats||[]).some(f=>f.acodec&&f.acodec!=='none');
  const progressive=formats.find(f=>f.acodec!=='none'&&f.protocol==='https')||formats.find(f=>f.protocol==='https');
  const audio=(info.formats||[]).filter(f=>f.vcodec==='none'&&f.acodec!=='none').sort((a,b)=>(b.abr||b.tbr||0)-(a.abr||a.tbr||0))[0];
  mediaUrl(best.url);if(audio)mediaUrl(audio.url);if(progressive)mediaUrl(progressive.url);
  const record={id:token(),url,title:(info.title||'Instagram video').slice(0,250),uploader:info.channel||info.uploader||'',width,height,duration:info.duration||0,hasAudio,qualities:qualitiesFor(width,height,hasAudio),created:Date.now(),preview:progressive?.url,previewAgent:info.http_headers?.['User-Agent'],source:best.url,audio:best.acodec==='none'?audio?.url:null,note:raw.entries?'For carousel posts, this version uses the first video.':''};
  record.formats=(info.formats||[]).filter(f=>f.url&&f.protocol==='https').map(f=>{mediaUrl(f.url);return{url:f.url,width:f.width,height:f.height,vcodec:f.vcodec,acodec:f.acodec,abr:f.abr,tbr:f.tbr};});
  record.outputs=new Map();record.active=0;
  media.set(record.id,record);return publicMedia(record);
 }finally{lookups--;}
}
async function prepare(job,record){
 downloads++;record.active++;job.status='working';job.message='Getting your media…';
 const dir=path.join(CACHE,job.id);
 try{
  await mkdir(dir,{recursive:true});
  job.filename=`reel-fetch-${new URL(record.url).pathname.split('/')[2]}-${job.quality}.${job.quality==='audio'?'mp3':'mp4'}`;
  job.file=path.join(dir,job.filename);await processMedia(record,job,message=>{job.message=message;});
  job.status='ready';job.created=Date.now();job.message='Your file is ready.';job.url=`/api/files/${job.id}`;
 }catch(error){job.status='failed';job.created=Date.now();job.error=userMessage(error);await rm(dir,{recursive:true,force:true}).catch(()=>{});}
 finally{downloads--;record.active--;record.created=Date.now();}
}
function json(res,status,data){res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(JSON.stringify(data));}
async function body(req){
 if(!req.headers['content-type']?.startsWith('application/json'))throw new UserError('Expected JSON.',415);
 let data='';for await(const chunk of req){data+=chunk;if(data.length>4096)throw new UserError('Request too large.',413);}
 try{const parsed=JSON.parse(data);if(!parsed||Array.isArray(parsed)||typeof parsed!=='object')throw new Error();return parsed;}catch{throw new UserError('Invalid JSON object.');}
}
async function serveFile(req,res,file,downloadName){
 const size=(await stat(file)).size;let range;
 try{range=parseRange(req.headers.range,size);}catch(error){res.setHeader('Content-Range',`bytes */${size}`);throw error;}
 const headers={'Content-Type':file.endsWith('.mp3')?'audio/mpeg':'video/mp4','Accept-Ranges':'bytes','Content-Length':range?range.end-range.start+1:size,'Cache-Control':'private, no-store'};
 if(downloadName)headers['Content-Disposition']=`attachment; filename="${downloadName}"`;
 if(range)headers['Content-Range']=`bytes ${range.start}-${range.end}/${size}`;
 res.writeHead(range?206:200,headers);if(req.method==='HEAD'){res.end();return;}
 await pipeline(createReadStream(file,range||{}),res);
}
async function preview(req,res,record){
 if(!record.preview)throw new UserError('Preview is unavailable. Try downloading the video.',404);
 const response=await openMedia(record.preview,{range:req.headers.range,agent:record.previewAgent});
 const timer=setTimeout(()=>response.destroy(new Error('Preview timed out.')),120000);
 res.on('close',()=>response.destroy());
 try{
  const headers={'Content-Type':'video/mp4','Cache-Control':'private, no-store','Accept-Ranges':'bytes'};
  for(const h of ['content-length','content-range'])if(response.headers[h])headers[h]=response.headers[h];
  res.writeHead(response.statusCode,headers);await pipeline(response,sizeLimit(),res);
 }finally{clearTimeout(timer);response.destroy();}
}
const files={'/app.js':'app.js','/style.css':'premium.css','/favicon.svg':'favicon.svg','/assets/reel-covers.webp':'assets/reel-covers.webp'};
const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml','.webp':'image/webp'};
export async function handler(req,res){
 res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','no-referrer');
 res.setHeader('Content-Security-Policy',"default-src 'self'; style-src 'self'; font-src 'self'; img-src 'self'; media-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'");
 res.setHeader('Permissions-Policy','camera=(), microphone=(), geolocation=()');
 res.setHeader('X-Frame-Options','DENY');
 try{
  validateRequest(req);
  if(PUBLIC_ORIGIN?.startsWith('https://'))res.setHeader('Strict-Transport-Security','max-age=31536000');
  const route=new URL(req.url,`http://${req.headers.host}`).pathname;
  if(req.method==='POST'){
   rateLimit(req);
   if(route==='/api/search'){const input=await body(req);return json(res,200,await search(input.url));}
   if(route==='/api/download'){
    const input=await body(req),record=media.get(input.id);
    if(!record||Date.now()-record.created>TTL)throw new UserError('This video session expired. Search for the link again.',410);
    if(input.rightsConfirmed!==true)throw new UserError('Confirm you have permission to download this content.',403);
    if(!record.qualities.some(q=>q.value===input.quality))throw new UserError('Choose an available quality.');
    const existing=jobs.get(record.outputs.get(input.quality));
    if(existing&&existing.status!=='failed'&&Date.now()-existing.created<TTL){const{file,...safe}=existing;return json(res,existing.status==='ready'?200:202,safe);}
    if(downloads>=2||jobs.size>=60)throw new UserError('The download queue is full. Please try again shortly.',429);
    const job={id:token(),quality:input.quality,status:'queued',created:Date.now()};jobs.set(job.id,job);
    record.outputs.set(input.quality,job.id);
    void prepare(job,record);return json(res,202,{id:job.id,status:job.status,message:job.message});
   }
   throw new UserError('Not found.',404);
  }
  if(!['GET','HEAD'].includes(req.method))throw new UserError('Method not allowed.',405);
  if(route==='/api/health')return json(res,200,{status:'ok'});
  if(route==='/'||pages[route]){res.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-cache'});return res.end(await render(route));}
  if(route==='/robots.txt'){res.writeHead(200,{'Content-Type':'text/plain; charset=utf-8'});return res.end(robots());}
  if(route==='/sitemap.xml'){res.writeHead(200,{'Content-Type':'application/xml; charset=utf-8'});return res.end(sitemap());}
  if(route.startsWith('/api/jobs/')){const job=jobs.get(route.split('/')[3]);if(!job)throw new UserError('Download expired. Please search again.',410);const{file,...safe}=job;return json(res,200,safe);}
  if(route.startsWith('/api/files/')){const job=jobs.get(route.split('/')[3]);if(!job||job.status!=='ready')throw new UserError('File is not ready or has expired.',410);return await serveFile(req,res,job.file,job.filename);}
  if(route.startsWith('/api/preview/')){const record=media.get(route.split('/')[3]);if(!record||Date.now()-record.created>TTL)throw new UserError('Preview expired. Search again.',410);return await preview(req,res,record);}
  if(files[route]){const file=files[route];res.writeHead(200,{'Content-Type':types[path.extname(file)],'Cache-Control':'no-cache'});return res.end(await readFile(path.join(ROOT,'public',file)));}
  throw new UserError('Not found.',404);
 }catch(error){if(!res.headersSent)json(res,error.status||502,{error:userMessage(error)});else res.destroy();}
}
async function cleanup(){
 for(const[url,entry]of metadataCache)if(Date.now()-entry.created>90000)metadataCache.delete(url);
 for(const[id,record]of media)if(!record.active&&Date.now()-record.created>TTL){media.delete(id);await rm(path.join(CACHE,id),{recursive:true,force:true});}
 for(const[id,job]of jobs)if(!['working','queued'].includes(job.status)&&Date.now()-job.created>TTL){jobs.delete(id);await rm(path.join(CACHE,id),{recursive:true,force:true});}
 for(const name of await readdir(CACHE)){if(!/^[a-f0-9]{48}$/.test(name)||jobs.has(name)||media.has(name))continue;const dir=path.join(CACHE,name);if(Date.now()-(await stat(dir)).mtimeMs>TTL)await rm(dir,{recursive:true,force:true});}
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 await mkdir(CACHE,{recursive:true});await cleanup();setInterval(()=>cleanup().catch(()=>{}),60000).unref();
 http.createServer(handler).listen(PORT,BIND_HOST,()=>console.log(`Reel Fetch: http://${BIND_HOST}:${PORT}`));
}

