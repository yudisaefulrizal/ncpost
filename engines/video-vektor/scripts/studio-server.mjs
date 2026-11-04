import http from 'node:http';
import {WebSocketServer,WebSocket} from 'ws';
import {createReadStream,existsSync,lstatSync,statSync} from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {ROOT,FINAL_FILES} from './lib/pipeline.mjs';
import {loadEnvironment} from './lib/project.mjs';
import {StudioStore,StudioError} from './lib/studio-store.mjs';

const types={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.svg':'image/svg+xml','.png':'image/png','.ttf':'font/ttf','.mp4':'video/mp4','.wav':'audio/wav','.json':'application/json; charset=utf-8','.srt':'application/x-subrip; charset=utf-8'};
function fileResponse(req,res,file,root,download=false){
 let current=root;
 for(const part of path.relative(root,file).split(path.sep)){current=path.join(current,part);if(existsSync(current)&&lstatSync(current).isSymbolicLink())throw new StudioError('Berkas tidak tersedia.',404);}
 if(!existsSync(file)||!statSync(file).isFile())throw new StudioError('Berkas tidak ditemukan.',404);
 const size=statSync(file).size,headers={'Content-Type':types[path.extname(file)]??'application/octet-stream','Accept-Ranges':'bytes','Cache-Control':'no-cache','X-Content-Type-Options':'nosniff'};
 if(download)headers['Content-Disposition']=`attachment; filename="${path.basename(file)}"`;
 let start=0,end=size-1,code=200;
 if(req.headers.range){
  const match=/^bytes=(\d*)-(\d*)$/.exec(req.headers.range);
  if(!match||(!match[1]&&!match[2])){res.writeHead(416,{'Content-Range':`bytes */${size}`});res.end();return;}
  start=match[1]?Number(match[1]):Math.max(0,size-Number(match[2]));end=match[1]&&match[2]?Math.min(size-1,Number(match[2])):size-1;
  if(!Number.isSafeInteger(start)||!Number.isSafeInteger(end)||start>end||start>=size){res.writeHead(416,{'Content-Range':`bytes */${size}`});res.end();return;}
  code=206;headers['Content-Range']=`bytes ${start}-${end}/${size}`;
 }
 headers['Content-Length']=Math.max(0,end-start+1);res.writeHead(code,headers);
 if(req.method==='HEAD'||size===0){res.end();return;}
 const stream=createReadStream(file,{start,end});stream.on('error',()=>res.destroy());res.on('close',()=>stream.destroy());stream.pipe(res);
}
async function body(req){
 if(!req.headers['content-type']?.startsWith('application/json'))throw new StudioError('Gunakan data JSON.',415);
 let data='';for await(const chunk of req){data+=chunk;if(Buffer.byteLength(data)>16384)throw new StudioError('Permintaan terlalu besar.',413);}
 try{const value=JSON.parse(data);if(!value||typeof value!=='object'||Array.isArray(value))throw Error();return value;}catch{throw new StudioError('Data JSON tidak valid.');}
}
export function createStudioServer({root=ROOT,store=new StudioStore({root}),startScheduler=true}={}){
 const sockets=new WebSocketServer({noServer:true});let last='',timer;
 const allowed=req=>{const host=req.headers.host??'';return /^(?:localhost|127\.0\.0\.1|\[::1\])(?::\d+)?$/.test(host)&&(!req.headers.origin||req.headers.origin===`http://${host}`);};
 const json=(res,value,status=200)=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(JSON.stringify(value));};
 const broadcast=()=>{try{const state=JSON.stringify(store.snapshot());if(state!==last){last=state;for(const client of sockets.clients)if(client.readyState===WebSocket.OPEN)client.send(`{"type":"state","data":${state}}`);}}catch(error){console.error('Status studio:',error.message);}};
 const server=http.createServer(async(req,res)=>{
  try{
   const host=req.headers.host??'';
   if(!allowed(req))throw new StudioError('Asal permintaan tidak diizinkan.',403);
   const url=new URL(req.url,`http://${host}`),pathname=decodeURIComponent(url.pathname);
   res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','no-referrer');
   if(req.method==='GET'&&pathname==='/api/state'){json(res,store.snapshot());return;}
   if(req.method==='POST'&&pathname==='/api/jobs'){const job=store.create(await body(req));json(res,{job},201);store.tick();broadcast();return;}
   const projectRoute=/^\/api\/projects\/([a-z0-9][a-z0-9-]{0,71})$/.exec(pathname);
   if(req.method==='DELETE'&&projectRoute){await body(req);const project=await store.removeProject(projectRoute[1]);json(res,{project});store.tick();broadcast();return;}
   const jobRoute=/^\/api\/jobs\/([a-z0-9-]+)(\/retry|\/stop)?$/.exec(pathname);
   if(jobRoute){
    let job;
    if(req.method==='PATCH'&&!jobRoute[2])job=store.update(jobRoute[1],await body(req));
    else if(req.method==='DELETE'&&!jobRoute[2]){
     await body(req);const current=jobRoute[1].startsWith('external-')?null:store.get(jobRoute[1]);
     job=current&&['queued','scheduled'].includes(current.state)?store.cancel(current.id):await store.remove(jobRoute[1]);
    }
    else if(req.method==='POST'&&jobRoute[2]==='/retry'){await body(req);job=store.retry(jobRoute[1]);}
    else if(req.method==='POST'&&jobRoute[2]==='/stop')job=store.stop(jobRoute[1],await body(req));
    else throw new StudioError('Metode tidak diizinkan.',405);
    json(res,{job});store.tick();broadcast();return;
   }
   if(!['GET','HEAD'].includes(req.method))throw new StudioError('Metode tidak diizinkan.',405);
   const media=/^\/media\/([a-z0-9][a-z0-9-]{0,71})\/([\w.-]+)$/.exec(pathname);
   if(media){
    const [,id,name]=media;let file;
    if(FINAL_FILES.includes(name))file=path.join(root,'hasil',id,name);
    else if(name==='poster.png'){
     file=path.join(root,'.cache/video-pipeline/projects',id,'reports/poster.png');
     if(!existsSync(file)&&id==='kucing-tidak-berguna')file=path.join(root,'.cache/video-pipeline/reports/poster.png');
    }else throw new StudioError('Berkas tidak tersedia.',404);
    fileResponse(req,res,file,root,url.searchParams.has('download'));return;
   }
   const assets={'/':'studio/index.html','/app.js':'studio/app.js','/style.css':'studio/style.css','/fonts/regular.ttf':'public/fonts/Lato-Regular.ttf','/fonts/heavy.ttf':'public/fonts/Lato-Heavy.ttf'};
   if(!assets[pathname])throw new StudioError('Halaman tidak ditemukan.',404);
   res.setHeader('Content-Security-Policy',`default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; media-src 'self'; connect-src 'self' ws://${host}; font-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'`);
   fileResponse(req,res,path.join(root,assets[pathname]),root);
  }catch(error){if(res.headersSent){res.destroy();return;}json(res,{error:error instanceof URIError?'Alamat tidak valid.':error.message},error.status??(error instanceof URIError?400:500));}
 });
 server.on('upgrade',(req,socket,head)=>{
  if(!allowed(req)||req.url!=='/api/socket'){socket.end('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n');return;}
  sockets.handleUpgrade(req,socket,head,client=>{
   client.on('error',()=>client.terminate());
   client.send(JSON.stringify({type:'state',data:store.snapshot()}));
  });
 });
 server.on('listening',()=>{if(startScheduler)store.start();timer=setInterval(broadcast,1000);});
 const close=async()=>{clearInterval(timer);await store.close();for(const client of sockets.clients)client.terminate();sockets.close();server.closeIdleConnections();await new Promise(resolve=>server.close(resolve));};
 return {server,store,close};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href){
 loadEnvironment();const port=Number(process.env.PORT??8077);
 if(!Number.isInteger(port)||port<1||port>65535)throw new Error('PORT harus berupa angka 1–65535.');
 const app=createStudioServer();
 app.server.on('error',error=>{console.error(error.code==='EADDRINUSE'?`Port ${port} sudah digunakan. Tutup proses tersebut atau atur PORT lain.`:error.message);process.exitCode=1;});
 app.server.listen(port,'127.0.0.1',()=>console.log(`Video Vektor siap: http://localhost:${port}\nJadwal mengikuti WIB. Tekan Ctrl+C untuk berhenti.`));
 let stopping=false;
 const stop=async()=>{if(stopping)return;stopping=true;await app.close();};
 process.on('SIGINT',stop);process.on('SIGTERM',stop);
}
