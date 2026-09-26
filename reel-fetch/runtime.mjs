import {isIP} from 'node:net';
import {UserError} from './lib.mjs';
export const PORT=Number(process.env.PORT||4178);
export const BIND_HOST=process.env.BIND_HOST||'127.0.0.1';
export const PUBLIC_ORIGIN=process.env.PUBLIC_ORIGIN?new URL(process.env.PUBLIC_ORIGIN).origin:null;
if(process.env.NODE_ENV==='production'&&(!PUBLIC_ORIGIN||!PUBLIC_ORIGIN.startsWith('https://')))throw new Error('Set PUBLIC_ORIGIN to your HTTPS site origin for production.');
const allowed=new Set([`127.0.0.1:${PORT}`,`localhost:${PORT}`,...(PUBLIC_ORIGIN?[new URL(PUBLIC_ORIGIN).host]:[])]);
export function validateRequest(req){
 if(!allowed.has(req.headers.host))throw new UserError('Unrecognized host.',403);
 if(req.method==='POST'&&req.headers.origin){
  const expected=PUBLIC_ORIGIN&&req.headers.host===new URL(PUBLIC_ORIGIN).host?PUBLIC_ORIGIN:`http://${req.headers.host}`;
  if(req.headers.origin!==expected)throw new UserError('Cross-origin requests are not allowed.',403);
 }
}
const windows=new Map();
setInterval(()=>{const now=Date.now();for(const[id,window]of windows)if(now-window.start>60000)windows.delete(id);},1000).unref();
export function rateLimit(req,now=Date.now()){
 let key=req.socket.remoteAddress||'unknown';
 if(process.env.TRUST_PROXY==='1'){
  const candidate=String(req.headers['x-forwarded-for']||'').split(',').at(-1).trim();
  if(isIP(candidate))key=candidate;
 }
 for(const[id,window]of windows)if(now-window.start>60000)windows.delete(id);
 if(windows.size>=5000&&!windows.has(key))throw new UserError('The service is busy. Please try again shortly.',429);
 const window=windows.get(key)||{start:now,count:0};windows.set(key,window);
 if(++window.count>20)throw new UserError('Too many requests. Please wait a minute.',429);
}
