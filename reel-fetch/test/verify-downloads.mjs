// Explicit live integration test. Pass a public URL you own or have permission to download.
import assert from 'node:assert/strict';
import {mkdir,writeFile,readFile} from 'node:fs/promises';
import path from 'node:path';
import {ROOT,FFMPEG,run} from '../lib.mjs';
const base=process.env.TEST_ORIGIN||'http://127.0.0.1:4178';
const url=process.argv[2];if(!url)throw new Error('Pass an authorized public Instagram URL.');
async function api(route,body){const r=await fetch(base+route,body?{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}:{});const data=await r.json();assert.ok(r.ok,JSON.stringify(data));return data;}
const record=await api('/api/search',{url});
console.log(JSON.stringify({title:record.title,width:record.width,height:record.height,qualities:record.qualities.map(q=>q.value)}));
const directory=path.join(ROOT,'.cache','verification');await mkdir(directory,{recursive:true});
const report=[];
for(const quality of record.qualities.map(q=>q.value).filter(q=>!process.argv[3]||q===process.argv[3])){
 let job=await api('/api/download',{id:record.id,quality,rightsConfirmed:true});
 const start=Date.now();while(job.status!=='ready'){assert.notEqual(job.status,'failed',job.error);assert.ok(Date.now()-start<600000,'Download timeout');await new Promise(r=>setTimeout(r,1000));job=await api('/api/jobs/'+job.id);}
 const response=await fetch(base+job.url);assert.equal(response.status,200);assert.match(response.headers.get('content-disposition'),/attachment/);
 const bytes=Buffer.from(await response.arrayBuffer());assert.ok(bytes.length>1000);const file=path.join(directory,job.filename);await writeFile(file,bytes);
 const {stderr}=await run(FFMPEG,['-hide_banner','-i',file,'-t','0','-f','null','-']);
 assert.match(stderr,/Audio:/);if(quality==='audio')assert.doesNotMatch(stderr,/Video:/);else{assert.match(stderr,/Video:/);if(quality!=='best'){const m=stderr.match(/Video:.*?\b(\d{2,5})x(\d{2,5})\b/);assert.ok(m);assert.equal(Math.min(Number(m[1]),Number(m[2])),Number(quality));}}
 const range=await fetch(base+job.url,{headers:{Range:'bytes=0-1023'}});assert.equal(range.status,206);assert.equal((await range.arrayBuffer()).byteLength,1024);
 report.push({quality,bytes:bytes.length,streams:stderr.split('\n').filter(l=>/Stream #|Duration:/.test(l)).map(l=>l.trim()),passed:true});console.log(`${quality}: verified ${bytes.length} bytes, audio present`);
}
await writeFile(path.join(directory,process.argv[3]?'recheck-report.json':'report.json'),JSON.stringify(report,null,2));
console.log('All requested formats passed real download, stream and range checks.');
