export function sample<T extends {at:number}>(frames:T[],progress:number,easing:'linear'|'smooth'='smooth'):T{
 const p=Math.max(0,Math.min(1,progress));
 let next=frames.findIndex(frame=>frame.at>=p);
 if(next<=0)return {...frames[next===-1?frames.length-1:0]};
 const a=frames[next-1],b=frames[next];
 let t=(p-a.at)/(b.at-a.at);
 if(easing==='smooth')t=t*t*(3-2*t);
 const result={...a};
 for(const key of Object.keys(a) as (keyof T)[]){
  if(typeof a[key]==='number'&&typeof b[key]==='number')result[key]=((a[key] as number)+((b[key] as number)-(a[key] as number))*t) as T[keyof T];
 }
 return result;
}
