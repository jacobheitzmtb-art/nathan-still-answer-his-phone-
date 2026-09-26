import test from 'node:test';
import assert from 'node:assert/strict';
import {canonicalUrl,qualitiesFor,parseRange,userMessage} from '../lib.mjs';
import {mediaUrl,publicAddress} from '../network.mjs';
import {render,sitemap,robots} from '../site.mjs';
test('only canonical public post endpoints are accepted; tracking data is stripped',()=>{
 assert.equal(canonicalUrl('https://www.instagram.com/reel/ABC_def123/?igsh=private-tracking'),'https://www.instagram.com/reel/ABC_def123/');
 for(const u of ['file:///etc/passwd','https://instagram.com.evil.test/reel/abcde/','https://instagram.com@127.0.0.1/p/abcde/','https://instagram.com:8443/p/abcde/','https://instagram.com/stories/name/123','https://instagram.com/explore','http://169.254.169.254/latest/meta-data','https://instagram.com/p/abcde/../../admin'])assert.throws(()=>canonicalUrl(u));
});
test('quality labels respect portrait, landscape and small sources',()=>{
 assert.deepEqual(qualitiesFor(1080,1920,true).map(q=>q.value),['best','1080','720','360','audio']);
 assert.deepEqual(qualitiesFor(1280,720,false).map(q=>q.value),['best','720','360']);
 assert.deepEqual(qualitiesFor(320,240,false).map(q=>q.value),['best']);
 assert.deepEqual(qualitiesFor(0,0,true).map(q=>q.value),['best','audio']);
});
test('range handling supports media seeking and rejects invalid ranges',()=>{
 assert.deepEqual(parseRange('bytes=10-19',100),{start:10,end:19});
 assert.deepEqual(parseRange('bytes=-10',100),{start:90,end:99});
 assert.deepEqual(parseRange('bytes=99-',100),{start:99,end:99});
 for(const r of ['bytes=100-','bytes=30-20','bytes=-0','bytes=0-1,4-5','bytes=-','potato'])assert.throws(()=>parseRange(r,100));
});
test('media allowlist and DNS checks block private networks and misleading domains',()=>{
 assert.equal(mediaUrl('https://scontent.cdninstagram.com/video.mp4').hostname,'scontent.cdninstagram.com');
 for(const u of ['https://cdninstagram.com.evil.test/a','http://scontent.fbcdn.net/a','https://localhost/a','https://scontent.fbcdn.net:8443/a','https://user:pass@scontent.fbcdn.net/a'])assert.throws(()=>mediaUrl(u));
 for(const ip of ['127.0.0.1','10.2.3.4','169.254.169.254','192.168.1.4','172.16.0.1','100.100.100.200','224.0.0.1'])assert.equal(publicAddress(ip,4),false);
 assert.equal(publicAddress('8.8.8.8',4),true);assert.equal(publicAddress('::1',6),false);assert.equal(publicAddress('::ffff:127.0.0.1',6),false);assert.equal(publicAddress('fc00::1',6),false);
});
test('errors do not expose raw tool paths or tokens',()=>{
 assert.doesNotMatch(userMessage(new Error('secret token C:/users/private/file')),/secret|private\/file/);
 assert.match(userMessage(new Error('login required')),/Instagram did not provide/);
});
test('every page has its own metadata and real navigation; local SEO is noindex',async()=>{
 for(const route of ['/','/terms','/privacy','/copyright','/contact','/disclaimer']){
  const html=await render(route);assert.match(html,/<title>/);assert.match(html,/rel="canonical"/);assert.match(html,/og:description/);assert.match(html,/Reel Fetch/);assert.doesNotMatch(html,/<!--META-->|reelkeep/);
 }
 assert.match(robots(),/Disallow: \//);assert.match(sitemap(),/\/copyright/);
});
