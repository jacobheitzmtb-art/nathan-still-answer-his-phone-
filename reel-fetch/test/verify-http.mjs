import assert from 'node:assert/strict';
const base='http://127.0.0.1:4178';
for(const route of ['/','/terms','/privacy','/copyright','/contact','/disclaimer','/style.css','/assets/reel-covers.webp','/app.js','/favicon.svg','/robots.txt','/sitemap.xml']){
 const response=await fetch(base+route);assert.equal(response.status,200,route);assert.ok(response.headers.get('content-security-policy'));assert.equal(response.headers.get('x-content-type-options'),'nosniff');
}
for(const [body,status] of [[{url:'http://127.0.0.1/secrets'},400],[{url:'https://instagram.com.evil.example/p/abcde'},400],[null,400]]){
 const response=await fetch(base+'/api/search',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});assert.equal(response.status,status);assert.ok((await response.json()).error);
}
const cross=await fetch(base+'/api/search',{method:'POST',headers:{'Content-Type':'application/json',Origin:'https://evil.example'},body:'{}'});assert.equal(cross.status,403);
const huge=await fetch(base+'/api/search',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({url:'x'.repeat(5000)})});assert.equal(huge.status,413);
const missing=await fetch(base+'/api/files/guess');assert.equal(missing.status,410);
const secret=await fetch(base+'/.local-config.json');assert.equal(secret.status,404);
console.log('12 public routes and 7 request/security cases passed.');
