import test from 'node:test';
import assert from 'node:assert/strict';
import {selectPlan,singleFlight} from '../processing.mjs';
const formats=[{url:'hd',width:1080,height:1920,vcodec:'vp9',acodec:'none',tbr:900},{url:'sd-low',width:720,height:1280,vcodec:'vp9',acodec:'none',tbr:300},{url:'sd-high',width:720,height:1280,vcodec:'vp9',acodec:'none',tbr:600},{url:'audio',vcodec:'none',acodec:'aac',abr:128}];
test('native resolutions skip re-encoding and keep the best bitrate',()=>{
 assert.equal(selectPlan({formats},'720').video.url,'sd-high');assert.equal(selectPlan({formats},'720').transcode,false);
 assert.equal(selectPlan({formats},'best').video.url,'hd');assert.equal(selectPlan({formats},'best').audio.url,'audio');
 assert.equal(selectPlan({formats},'360').transcode,true);assert.equal(selectPlan({formats},'360').video.url,'hd');
});
test('audio-only downloads do not fetch a video stream when audio is separate',()=>{
 const plan=selectPlan({formats},'audio');assert.equal(plan.video.url,'audio');assert.equal(plan.audio,null);assert.equal(plan.audioOnly,true);
});
test('shared work runs once and failed cache entries can be retried',async()=>{
 const cache=new Map();let count=0;
 const work=()=>{count++;return 'result';};
 assert.deepEqual(await Promise.all([singleFlight(cache,'same',work),singleFlight(cache,'same',work)]),['result','result']);assert.equal(count,1);
 await assert.rejects(singleFlight(cache,'retry',()=>{throw new Error('temporary');}));
 assert.equal(await singleFlight(cache,'retry',()=>42),42);
});
