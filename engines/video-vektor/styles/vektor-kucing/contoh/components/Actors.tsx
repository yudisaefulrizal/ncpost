import React from 'react';
import {C,Star} from './Illustrations';

export const CatHead:React.FC<{x?:number;y?:number;s?:number;f:number;asleep?:boolean;look?:number;tilt?:number}>=({x=0,y=0,s=1,f,asleep=false,look=0,tilt=0})=>{
 const blink=f%163>154;
 return <g transform={`translate(${x} ${y}) rotate(${tilt}) scale(${s})`}>
  <path d="M-82 0 L-88 -106 Q-87 -117 -76 -109 L-32 -73 L27 -73 L76 -110 Q86 -117 86 -104 L80 0Z" fill={C.orange}/>
  <path d="M-74 -91 L-67 -47 L-42 -66Z M72 -91 L39 -65 L67 -46Z" fill="#D96E66"/>
  <ellipse cy="15" rx="93" ry="80" fill={C.orangeLight}/>
  <path d="M-28 -63 L-19 -37 M1 -68 L1 -38 M31 -61 L23 -36" fill="none" stroke={C.orangeDark} strokeWidth="11" strokeLinecap="round"/>
  <ellipse cx="-27" cy="39" rx="30" ry="25" fill="#FFD998"/><ellipse cx="27" cy="39" rx="30" ry="25" fill="#FFD998"/>
  {asleep||blink?<g stroke={C.ink} strokeWidth="6" fill="none" strokeLinecap="round"><path d="M-55 8 Q-40 21 -25 8"/><path d="M25 8 Q40 21 55 8"/></g>:<g>
   {[-40,40].map(q=><g key={q}><ellipse cx={q} cy="9" rx="19" ry="24" fill="#FFF5DE"/><ellipse cx={q+look*7} cy="10" rx="8" ry="17" fill={C.ink}/><circle cx={q+look*7+3} cy="3" r="3.5" fill="white"/></g>)}
  </g>}
  <path d="M-9 30 Q0 22 9 30 L0 38Z" fill="#A95255"/>
  <path d="M0 38 L0 46 M0 46 Q-11 56 -21 47 M0 46 Q11 56 21 47" stroke={C.ink} strokeWidth="3.6" fill="none" strokeLinecap="round"/>
  <g stroke="#B77B4C" strokeWidth="3" strokeLinecap="round"><path d="M-55 35 L-104 27 M-57 46 L-107 47 M55 35 L104 27 M57 46 L107 47"/></g>
 </g>;
};

export const ActorCat:React.FC<{x:number;y:number;s?:number;f:number;walk?:number;asleep?:boolean;faceRight?:boolean;crouch?:number;stretch?:number}>=({x,y,s=1,f,walk=0,asleep=false,faceRight=false,crouch=0,stretch=0})=>{
 const step=f*.2;
 const breath=Math.sin(f/19)*1.8;
 const bob=walk?Math.sin(step*2)*3:breath;
 const bodyY=-47+crouch*22;
 const swing=(phase:number)=>Math.sin(step+phase)*27*walk;
 return <g transform={`translate(${x} ${y}) scale(${faceRight?-s:s} ${s})`}>
  <path d={`M105 ${bodyY+20} C220 ${bodyY-5} 241 ${bodyY-94} ${197+Math.sin(f/21)*12} ${bodyY-123} C170 ${bodyY-147} 148 ${bodyY-120} 171 ${bodyY-100}`} fill="none" stroke={C.orangeDark} strokeWidth="36" strokeLinecap="round"/>
  {walk>0&&[-72,75].map((q,i)=><g key={q} transform={`translate(${q} ${bodyY+35}) rotate(${swing(i?Math.PI:0)})`}><path d="M0 0 L10 60 L-1 85" stroke="#D97A3B" strokeWidth="26" strokeLinecap="round" fill="none"/><ellipse cx="-7" cy="87" rx="24" ry="12" fill="#E79B52"/></g>)}
  <ellipse cx="20" cy={bodyY+bob} rx={136+stretch*16} ry={asleep?83:73-crouch*8} fill={C.orange}/>
  <path d={`M25 ${bodyY-59} Q43 ${bodyY-27} 26 ${bodyY-16} M64 ${bodyY-55} Q83 ${bodyY-28} 64 ${bodyY-13} M102 ${bodyY-40} Q119 ${bodyY-20} 101 ${bodyY-4}`} stroke={C.orangeDark} strokeWidth="13" fill="none" strokeLinecap="round"/>
  {[-75,68].map((q,i)=><g key={q} transform={`translate(${q} ${bodyY+34}) rotate(${swing(i?0:Math.PI)})`}>
   <path d={`M0 0 L${stretch*16} ${asleep?30:62-crouch*15}`} stroke={C.orangeLight} strokeWidth="31" strokeLinecap="round"/>
   <ellipse cx={-7+stretch*16} cy={asleep?39:72-crouch*15} rx="32" ry="16" fill={C.orangeLight}/>
  </g>)}
  <CatHead x={-71} y={bodyY-54+bob+crouch*18} s={.91} f={f} asleep={asleep} tilt={asleep?-11:crouch*8} look={walk?-1:0}/>
 </g>;
};

export const Sleeper:React.FC<{x:number;y:number;s?:number;f:number;stars?:boolean}>=({x,y,s=1,f,stars=false})=><g transform={`translate(${x} ${y}) scale(${s})`}>
 <ActorCat x={0} y={0} f={f} asleep/>
 {[0,1,2].map(i=>{
  const p=((f+i*36)%130)/130;
  return <g key={i} opacity={Math.sin(p*Math.PI)*.8} transform={`translate(${70+p*70} ${-183-p*134}) rotate(${p*15})`}>
   {stars?<Star x={0} y={0} s={8+p*8} color="#E8C077"/>:<text fontFamily="Lato" fontSize={22+p*18} fontWeight="900" fill="#568F88">z</text>}
  </g>;
 })}
</g>;

export const Hand:React.FC<{x:number;y:number;s?:number;angle?:number;color?:string}>=({x,y,s=1,angle=0,color='#DFAB8C'})=><g transform={`translate(${x} ${y}) rotate(${angle}) scale(${s})`}>
 <path d="M151 7 L34 7 Q9 -10 -5 -5 L-55 14 Q-66 20 -58 28 Q-54 32 -44 30 L-5 18 L-56 37 Q-68 42 -62 51 Q-58 56 -47 53 L-3 38 L-47 57 Q-57 62 -50 69 Q-47 72 -39 69 L9 49 L-13 68 Q-22 77 -14 83 Q-8 87 2 79 L50 45 L151 45Z" fill={color}/>
 <path d="M-5 18 L28 12 M-3 38 L30 27 M9 49 L35 37" stroke="#BA816F" strokeWidth="2" fill="none" strokeLinecap="round"/>
</g>;
