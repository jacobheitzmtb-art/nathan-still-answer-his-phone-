import {writeFile,mkdir} from 'node:fs/promises';
const [url,output='benchmark.json']=process.argv.slice(2);
if(!url)throw new Error('Pass an authorized public URL and a report filename.');
const base='http://127.0.0.1:4178';
async function api(route,body){const r=await fetch(base+route,body?{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}:{});const data=await r.json();if(!r.ok)throw new Error(data.error);return data;}
const report={timestamp:new Date().toISOString(),measurements:[]};
let start=performance.now();const media=await api('/api/search',{url});report.measurements.push({operation:'search',ms:Math.round(performance.now()-start)});
for(const quality of ['best','720','audio','best']){
 start=performance.now();let job=await api('/api/download',{id:media.id,quality,rightsConfirmed:true});
 while(job.status!=='ready'){if(job.status==='failed')throw new Error(job.error);if(performance.now()-start>600000)throw new Error('Timed out');await new Promise(r=>setTimeout(r,100));job=await api('/api/jobs/'+job.id);}
 report.measurements.push({operation:quality,ms:Math.round(performance.now()-start),timings:job.timings});console.log(quality,report.measurements.at(-1).ms+' ms');
}
start=performance.now();await api('/api/search',{url});report.measurements.push({operation:'repeat-search',ms:Math.round(performance.now()-start)});
await mkdir('.cache/verification',{recursive:true});await writeFile('.cache/verification/'+output,JSON.stringify(report,null,2));console.log(JSON.stringify(report));
