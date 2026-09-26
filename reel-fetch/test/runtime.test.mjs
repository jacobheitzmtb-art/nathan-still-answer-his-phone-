import test from 'node:test';
import assert from 'node:assert/strict';
import {validateRequest,rateLimit,PORT} from '../runtime.mjs';
test('host and origin checks reject foreign requests',()=>{
 assert.doesNotThrow(()=>validateRequest({method:'POST',headers:{host:`localhost:${PORT}`,origin:`http://localhost:${PORT}`}}));
 assert.throws(()=>validateRequest({method:'GET',headers:{host:'attacker.example'}}));
 assert.throws(()=>validateRequest({method:'POST',headers:{host:`localhost:${PORT}`,origin:'https://attacker.example'}}));
});
test('rate limits isolate clients and expire their windows',()=>{
 const a={socket:{remoteAddress:'192.0.2.1'},headers:{}},b={socket:{remoteAddress:'192.0.2.2'},headers:{}};
 for(let i=0;i<20;i++)rateLimit(a,1000);
 assert.throws(()=>rateLimit(a,1001),{status:429});
 assert.doesNotThrow(()=>rateLimit(b,1001));
 assert.doesNotThrow(()=>rateLimit(a,62000));
});
