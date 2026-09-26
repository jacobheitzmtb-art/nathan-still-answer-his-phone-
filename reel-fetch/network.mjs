import https from 'node:https';
import {lookup} from 'node:dns/promises';
import {BlockList} from 'node:net';
import {Transform} from 'node:stream';
import {pipeline} from 'node:stream/promises';
import {createWriteStream} from 'node:fs';
import {LIMIT,UserError} from './lib.mjs';
const blocked=new BlockList();
for(const [a,p]of [['0.0.0.0',8],['10.0.0.0',8],['100.64.0.0',10],['127.0.0.0',8],['169.254.0.0',16],['172.16.0.0',12],['192.0.0.0',24],['192.0.2.0',24],['192.168.0.0',16],['198.18.0.0',15],['198.51.100.0',24],['203.0.113.0',24],['224.0.0.0',4],['240.0.0.0',4]])blocked.addSubnet(a,p,'ipv4');
blocked.addSubnet('192.88.99.0',24,'ipv4');
const ipv6=new BlockList();for(const[a,p]of [['2001::',23],['2001:db8::',32],['2002::',16]])ipv6.addSubnet(a,p,'ipv6');
export function publicAddress(address,family){return family===4?!blocked.check(address,'ipv4'):family===6&&/^[23][0-9a-f]{3}:/i.test(address)&&!ipv6.check(address,'ipv6');}
export function mediaUrl(value){
 const u=new URL(value);
 if(u.protocol!=='https:'||u.username||u.password||u.port||!['cdninstagram.com','fbcdn.net'].some(d=>u.hostname.endsWith('.'+d)))throw new UserError('This media source is unsupported.',502);
 return u;
}
export async function openMedia(value,{range,agent}={},depth=0){
 const url=mediaUrl(value);if(depth>3)throw new UserError('Too many media redirects.',502);
 const addresses=await lookup(url.hostname,{all:true});
 if(!addresses.length||addresses.some(a=>!publicAddress(a.address,a.family)))throw new UserError('This media address is not permitted.',502);
 const selected=addresses.find(a=>a.family===4)||addresses[0];
 const headers={Referer:'https://www.instagram.com/','User-Agent':agent||'Mozilla/5.0'};
 if(range){if(!/^bytes=\d*-\d*$/.test(range))throw new UserError('Invalid byte range.',416);headers.Range=range;}
 const response=await new Promise((resolve,reject)=>{
  const request=https.get(url,{headers,lookup:(_host,options,cb)=>options?.all?cb(null,[selected]):cb(null,selected.address,selected.family)},resolve);
  request.setTimeout(20000,()=>request.destroy(new Error('Media request timed out.')));request.on('error',reject);
 });
 if([301,302,303,307,308].includes(response.statusCode)){response.resume();if(!response.headers.location)throw new UserError('Media redirect is unavailable.',502);return openMedia(new URL(response.headers.location,url).href,{range,agent},depth+1);}
 if(response.statusCode===416){response.destroy();throw new UserError('Requested media range is unavailable.',416);}
 if(![200,206].includes(response.statusCode)){response.destroy();throw new UserError('Instagram denied access to this media. Try fetching it again later.',502);}
 if(Number(response.headers['content-length']||0)>LIMIT){response.destroy();throw new UserError('The source exceeds the 250 MB limit.',413);}
 return response;
}
export function sizeLimit(){let total=0;return new Transform({transform(chunk,_encoding,cb){total+=chunk.length;cb(total>LIMIT?new UserError('The source exceeds the 250 MB limit.',413):null,chunk);}});}
export async function saveMedia(url,file,agent){
 const response=await openMedia(url,{agent});const timer=setTimeout(()=>response.destroy(new Error('Media transfer timed out.')),180000);
 try{await pipeline(response,sizeLimit(),createWriteStream(file,{flags:'wx'}));}finally{clearTimeout(timer);response.destroy();}
}
