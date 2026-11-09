import {readdirSync,readFileSync,statSync} from 'node:fs';
import path from 'node:path';

const files=dir=>readdirSync(dir).flatMap(n=>{const f=path.join(dir,n);return statSync(f).isDirectory()?files(f):/\.(tsx?|jsx?)$/.test(n)?[f]:[]});
const num='-?\\d+(?:\\.\\d+)?';

// Cek statis cepat (tanpa render) untuk kesalahan yang menjatuhkan Remotion di tengah render.
export function lintSource(dir){
 const problems=[];
 for(const file of files(dir)){
  const lines=readFileSync(file,'utf8').split('\n');
  lines.forEach((line,i)=>{
   const at=`${path.relative(dir,file)}:${i+1}`;
   for(const m of line.matchAll(new RegExp(`interpolate\\s*\\(\\s*[^,\\[\\]]+,\\s*\\[\\s*(${num})\\s*,\\s*(${num})\\s*\\]`,'g')))
    if(+m[2]<=+m[1])problems.push(`${at} rentang interpolate harus naik, ditemukan [${m[1]},${m[2]}]`);
   if(/\binterpolate\s*\(\s*[^,]+,\s*\[\s*[^\],]+,\s*[^\]]+\]/.test(line)&&/(?:const|function)\s+\w+\s*=?.*=>.*interpolate\s*\(/.test(line)&&!/Math\.max\(/.test(line))
    problems.push(`${at} helper yang membungkus interpolate harus menjaga rentang: [a,Math.max(b,a+1)]`);
  });
 }
 return problems;
}
