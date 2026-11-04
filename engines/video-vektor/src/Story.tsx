import React from 'react';
import {AbsoluteFill,Easing,interpolate,useCurrentFrame} from 'remotion';
import {C,Granary,Heart,Mouse,Plant,Ship,Sofa,Star,Wheat} from './components/Illustrations';
import {ActorCat,CatHead,Hand,Sleeper} from './components/Actors';
import {Earth} from './components/Earth';
import {Shot} from './edit';

const P={ink:'#202846',cream:'#F7EAD0',sand:'#E5B577',dune:'#BD8159',teal:'#267E7B',night:'#202D4D'};
const e=(f:number,a:number,b:number)=>interpolate(f,[a,b],[0,1],{extrapolateLeft:'clamp',extrapolateRight:'clamp',easing:Easing.inOut(Easing.cubic)});
const mix=(a:number,b:number,p:number)=>a+(b-a)*p;
const Cam:React.FC<{x?:number;y?:number;z?:number;children:React.ReactNode}>=({x=960,y=540,z=1,children})=><g transform={`translate(960 540) scale(${z}) translate(${-x} ${-y})`}>{children}</g>;
const Text:React.FC<{x:number;y:number;size?:number;color?:string;children:React.ReactNode;anchor?:'middle'|'start'}>=({x,y,size=62,color=P.ink,children,anchor='middle'})=><text x={x} y={y} textAnchor={anchor} fontFamily="Lato" fontWeight="900" fontSize={size} fill={color}>{children}</text>;

const Room:React.FC<{f:number;night?:boolean;desk?:boolean}>=({f,night=false,desk=false})=><>
 <rect x="-1500" y="-1200" width="5000" height="2600" fill={night?'#414963':'#F4E7CD'}/>
 <rect x="-1500" y="798" width="5000" height="1400" fill={night?'#976F76':'#D8B59A'}/>
 <path d="M-1500 798 L3500 798" stroke={night?'#BD9B91':'#E8D1B1'} strokeWidth="18"/>
 {[0,1,2,3,4,5].map(i=><path key={i} d={`M-1500 ${900+i*115} L3500 ${900+i*115}`} stroke={night?'#87616B':'#C6A28A'} strokeWidth="3" opacity=".45"/>)}
 <g transform="translate(280 185)">
  <path d="M0 30 Q0 -70 136 -70 Q272 -70 272 30 L272 350 L0 350Z" fill={night?'#233454':'#A6CEC0'} stroke={night?'#847D90':'#EAD7B6'} strokeWidth="17"/>
  <circle cx={night?193:166} cy={night?7:62+Math.sin(f/300)*7} r={night?30:49} fill={night?'#F5DCA5':'#F1CE7B'}/>
  {night&&[0,1,2,3,4,5].map(i=><Star key={i} x={26+(i*53)%220} y={-10+(i*61)%230} s={3+i%3} color="#D4D8DE"/>)}
  <path d="M0 271 Q70 202 146 267 Q197 224 272 262 L272 350 L0 350Z" fill={night?'#2E525D':'#72A59B'}/>
  <path d="M136 -65 L136 350 M0 126 L272 126" stroke={night?'#847D90':'#EAD7B6'} strokeWidth="12"/>
 </g>
 <path d="M190 84 L190 570 L128 570 L139 76Z M630 82 L630 570 L690 570 L678 76Z" fill={night?'#67727C':'#D2A885'}/>
 <g transform="translate(1570 365)">
  {night&&<ellipse cy="260" rx="320" ry="430" fill="#FFD593" opacity=".075"/>}
  <path d="M0 0 L0 425 M-77 425 L77 425" stroke={night?'#D1AC83':'#687A71'} strokeWidth="13" strokeLinecap="round"/>
  <path d="M-108 -110 L108 -110 L159 52 L-159 52Z" fill={night?'#F2C780':'#D3A569'}/><ellipse cy="52" rx="159" ry="18" fill="#FFE0A1"/>
 </g>
 <g transform="translate(1170 193) rotate(3)"><rect x="-57" y="-65" width="114" height="130" rx="4" fill={night?'#A08D86':'#B78B65'}/><rect x="-46" y="-54" width="92" height="108" fill={night?'#707F8A':'#D5CBA2'}/><path d="M-42 47 L-10 -12 L39 47Z" fill="#799382"/><circle cx="18" cy="-26" r="15" fill="#E8BA71"/></g>
 <Plant x={1742} y={728} s={1.02} color={night?'#476F70':'#589885'}/>
 <ellipse cx="963" cy="925" rx="682" ry="102" fill={night?'#B17E80':'#C69D87'} opacity=".55"/>
 {!desk&&<Sofa x={1010} y={688} s={1.7} warm={night}/>}
</>;

const Human:React.FC<{x:number;y:number;s?:number;f:number;relax?:number}>=({x,y,s=1,f,relax=0})=><g transform={`translate(${x} ${y}) scale(${s})`}>
 <path d="M-75 77 L-83 205 L-12 206 L13 96 M20 91 L46 205 L117 200 L88 75" fill="#35425F"/>
 <path d={`M-86 -87 Q-18 ${-122+relax*15} 65 -82 L104 105 Q1 142 -102 103Z`} fill="#7A87BA"/>
 <path d="M-25 -116 L-24 -82 Q0 -58 23 -84 L22 -121Z" fill="#C68E77"/>
 <g transform={`translate(${relax*7} ${relax*8+Math.sin(f/32)*relax*2}) rotate(${relax*5})`}>
  <ellipse cy="-169" rx="65" ry="77" fill="#DFA98C"/>
  <path d="M-66 -151 Q-91 -247 -8 -256 Q89 -254 65 -144 L43 -173 L36 -210 Q-12 -187 -57 -205Z" fill={P.ink}/>
  <path d={relax>.4?'M-34 -160 Q-24 -150 -14 -160 M16 -160 Q25 -150 34 -160':'M-34 -158 L-17 -158 M17 -158 L33 -158'} fill="none" stroke="#77534F" strokeWidth="4" strokeLinecap="round"/>
  <path d="M-15 -132 Q1 -118 17 -132" fill="none" stroke="#945F57" strokeWidth="4" strokeLinecap="round"/>
 </g>
 <path d="M-77 -49 Q-132 16 -70 52 L24 62 M72 -45 Q128 16 65 49 L3 62" fill="none" stroke="#DFA98C" strokeWidth="26" strokeLinecap="round"/>
</g>;

const Dunes:React.FC<{f:number;night?:boolean}>=({f,night=false})=><>
 <rect x="-2000" y="-1200" width="7000" height="3200" fill={night?'#44516B':'#F0CE91'}/>
 <circle cx="1480" cy="217" r="112" fill={night?'#F3D398':'#F6E0A1'}/>
 <path d="M-1500 690 Q-300 130 500 650 Q1100 80 1860 602 Q2200 376 3500 640 L3500 1400 L-1500 1400Z" fill={night?'#5B646F':'#D49B66'}/>
 <path d="M-1500 927 Q-300 437 700 799 Q1500 350 2400 777 Q2900 500 3500 860 L3500 1700 L-1500 1700Z" fill={night?'#818071':'#BB8058'}/>
 <path d="M-1500 890 Q300 712 1300 825 Q2500 694 3500 902 L3500 1700 L-1500 1700Z" fill={night?'#A38B6D':'#D9AD76'}/>
 <path d={`M-600 676 Q420 ${647+Math.sin(f/80)*7} 1250 694`} fill="none" stroke={night?'#8F8874':'#E8B981'} strokeWidth="4"/>
</>;

const GrainPile:React.FC<{x:number;y:number;s?:number;f:number;pour?:boolean}>=({x,y,s=1,f,pour=false})=><g transform={`translate(${x} ${y}) scale(${s})`}>
 <path d="M-290 24 Q-125 -138 0 -178 Q156 -122 291 24Z" fill="#D19A4B"/>
 {Array.from({length:64},(_,i)=>{
  const row=Math.floor(i/11),q=i%11;
  const xx=(q-5)*43+(row%2)*17;
  const yy=15-row*26;
  return <ellipse key={i} cx={xx*(1-row*.11)} cy={yy} rx={12+(i%3)} ry="7" transform={`rotate(${i*43%130} ${xx*(1-row*.11)} ${yy})`} fill={i%3?'#EEC26B':'#FFE0A0'}/>;
 })}
 {pour&&Array.from({length:24},(_,i)=>{
  const p=((f*1.9+i*29)%390)/390;
  return <ellipse key={i} cx={Math.sin(i*13)*32+p*48} cy={-590+p*440} rx="11" ry="6" transform={`rotate(${f*3+i*33} ${Math.sin(i*13)*32+p*48} ${-590+p*440})`} fill={i%2?'#FFD382':'#EAB459'}/>;
 })}
</g>;

const Sack:React.FC<{x:number;y:number;s?:number;angle?:number}>=({x,y,s=1,angle=0})=><g transform={`translate(${x} ${y}) rotate(${angle}) scale(${s})`}><path d="M-53 -97 Q0 -74 53 -97 L41 -64 Q106 33 61 89 Q0 112 -61 89 Q-106 33 -41 -64Z" fill="#A77753"/><path d="M-40 -65 L40 -65" stroke="#E4BB81" strokeWidth="9"/><Wheat x={0} y={58} s={.36}/></g>;

const Farmhand:React.FC<{x:number;y:number;f:number;s?:number}>=({x,y,f,s=1})=><g transform={`translate(${x} ${y}) scale(${s})`}>
 <g transform={`rotate(${Math.sin(f*.13)*18} -25 -18)`}><path d="M-25 -18 L-39 75" stroke="#745B4C" strokeWidth="22" strokeLinecap="round"/></g>
 <g transform={`rotate(${-Math.sin(f*.13)*18} 25 -18)`}><path d="M25 -18 L39 75" stroke="#916B50" strokeWidth="22" strokeLinecap="round"/></g>
 <path d="M-44 -99 L42 -99 L58 0 L-56 0Z" fill="#EFE1B2"/>
 <circle cy="-130" r="33" fill="#B7825F"/><path d="M-43 -148 Q0 -193 43 -148 L63 -140 L-61 -140Z" fill="#BD8C4B"/>
 <path d="M-33 -73 L-76 -111 M32 -70 L65 -110" stroke="#B7825F" strokeWidth="17" strokeLinecap="round"/>
 <Sack x={0} y={-112} s={.6}/>
</g>;

const HomeOpening:React.FC<{kind:string;f:number;duration:number;global:number}>=({kind,f,duration,global})=>{
 if(kind==='glass'){
  const push=e(f,3,25),fall=e(f,26,53),impact=e(f,52,58);
  return <Cam x={mix(1280,1390,fall)} y={mix(570,800,fall)} z={1.7}>
   <Room f={global}/>
   <ActorCat x={1040} y={687} s={1.48} f={global}/>
   <path d={`M1110 602 Q1190 ${591-push*20} ${1260+push*53} ${617+push*7}`} fill="none" stroke={C.orangeLight} strokeWidth="46" strokeLinecap="round"/>
   <ellipse cx="1310" cy="686" rx="119" ry="23" fill="#BD8C6A"/><path d="M1227 694 L1200 873 M1394 692 L1420 875" stroke="#A67D60" strokeWidth="13"/>
   <g transform={`translate(${1290+push*74+fall*61} ${628+fall*224}) rotate(${fall*130})`} opacity={1-impact}>
    <path d="M-32 -67 L32 -67 L24 31 L-24 31Z" fill="#CEE7E0" stroke="#6DA9A3" strokeWidth="4"/><path d="M-28 -24 L28 -24 L22 28 L-22 28Z" fill="#88C1BB"/><path d="M-22 -53 L-18 -29" stroke="#FCF5E2" strokeWidth="5" strokeLinecap="round"/>
   </g>
   {impact>0&&Array.from({length:7},(_,i)=><path key={i} d={`M${1410+i*7} 874 l${(i-3)*11*impact} ${-Math.sin(i*.7)*28*impact-3}`} stroke={i%2?'#9DCFC8':'#D7E7D5'} strokeWidth="5" opacity={1-e(f,61,75)}/>)}
  </Cam>;
 }
 if(kind==='stare')return <>
  <rect width="1920" height="1080" fill="#77A9A0"/>
  <path d="M-50 932 Q960 712 1980 925 L1980 1200 L-50 1200Z" fill="#55958E"/>
  <CatHead x={960} y={525} s={mix(4.1,4.5,e(f,0,duration))} f={global} look={mix(-1,0,e(f,0,23))} tilt={-3+3*e(f,10,45)}/>
  <g opacity={e(f,37,49)*(1-e(f,76,87))}><Text x={1510} y={280} size={69} color="#FDF0CF">Tidak berguna?</Text><path d="M1390 307 Q1450 335 1509 311" stroke="#F4C478" strokeWidth="6" fill="none"/></g>
 </>;
 const close=kind==='sleep';
 const camera=close?{x:896,y:533,z:mix(2.1,2.28,e(f,0,duration))}:{x:mix(985,960,e(f,0,duration)),y:mix(560,585,e(f,0,duration)),z:mix(1.0,1.13,e(f,0,duration))};
 return <Cam {...camera}><Room f={global}/><Sleeper x={995} y={688} s={1.52} f={global}/>
  {close&&<g opacity=".3"><path d={`M1160 479 Q${1179+Math.sin(f/13)*12} 442 1160 401`} fill="none" stroke="#68A299" strokeWidth="4"/></g>}
 </Cam>;
};

const Ancient:React.FC<{kind:string;f:number;duration:number}>=({kind,f,duration})=>{
 if(kind==='ancient'){
  const pull=e(f,0,80),z=mix(4.945,1,pull);
  return <Cam x={mix(824,970,pull)} y={mix(641,540,pull)} z={z}>
   <Dunes f={f}/><Granary x={1280} y={610} s={1.05}/>
   <Farmhand x={1460-e(f,20,100)*130} y={804} f={f} s={.8}/>
   <ActorCat x={895} y={735} s={1} f={f} crouch={.1}/>
   <Plant x={1674} y={846} s={.7} color="#7F8D65"/>
   {Array.from({length:9},(_,i)=><Wheat key={i} x={173+i*37} y={817+i%2*13} s={.65} angle={Math.sin(f/34+i)*7}/>)}
   <path d="M-200 1098 Q280 720 660 1098Z" fill="#7B8861"/>
  </Cam>;
 }
 const p=e(f,0,duration);
 return <Cam x={mix(960,1340,p)} y={mix(560,610,p)} z={mix(1,1.28,p)}>
  <Dunes f={f}/><Granary x={1310} y={591} s={1.22}/>
  {Array.from({length:18},(_,i)=><Wheat key={i} x={-130+i*39} y={861+(i%3)*21} s={.74+(i%3)*.11} angle={Math.sin(f/29+i)*8}/>)}
  <Farmhand x={570+f*2.3} y={803} f={f} s={1}/><Farmhand x={210+f*2.1} y={865} f={f+40} s={1.07}/>
  <g transform="translate(1310 697)"><GrainPile x={0} y={53} s={.57} f={f} pour/><Sack x={-44} y={-246} s={.67} angle={125+Math.sin(f/25)*3}/></g>
  <ActorCat x={1680} y={809} s={.73} f={f} crouch={.3}/>
  <Sack x={1570} y={773} s={.7}/>
 </Cam>;
};

const Store:React.FC<{f:number}>=({f})=><>
 <rect x="-1500" y="-1500" width="5000" height="3500" fill="#966C53"/>
 <path d="M-1500 776 L3500 776 L3500 2000 L-1500 2000Z" fill="#CDA470"/>
 <path d="M1030 -100 L1030 776 L1530 776 L1530 -100" fill="#E4BC7F"/>
 <path d="M1090 0 L1090 776 L1470 776 L1470 0Z" fill="#F2D293"/>
 <path d="M1088 776 L1470 776 L1820 1110 L650 1110Z" fill="#E6BB7C" opacity=".47"/>
 {[-220,480,1640,2260].map(x=><g key={x}><path d={`M${x} -900 L${x} 777`} stroke="#75523E" strokeWidth="50"/><path d={`M${x+26} -900 L${x+26} 777`} stroke="#B0845D" strokeWidth="7"/></g>)}
 <Sack x={1740} y={746} s={1.3}/><Sack x={1880} y={740} s={1.15}/><Sack x={1808} y={590} s={1.05}/>
 <GrainPile x={600} y={800} s={1.17} f={f}/>
 {Array.from({length:12},(_,i)=><ellipse key={i} cx={970+i*58} cy={809+Math.sin(i*8)*33} rx="8" ry="4" fill="#F0C774" transform={`rotate(${i*37} ${970+i*58} ${809+Math.sin(i*8)*33})`}/>)}
</>;

const Hunt:React.FC<{kind:string;f:number;duration:number}>=({kind,f,duration})=>{
 if(kind==='grain')return <Cam x={mix(720,790,e(f,0,duration))} y={738} z={1.7}>
  <Store f={f}/><Mouse x={mix(1320,900,e(f,4,duration))} y={817+Math.sin(f*.6)*2} s={.8}/><Mouse x={mix(1460,1038,e(f,18,duration))} y={857+Math.sin(f*.6)*2} s={.65}/>
  <g opacity={e(f,34,47)}><path d="M824 755 Q812 741 826 727 M849 749 Q835 731 851 715" stroke="#E9D5B0" strokeWidth="3" fill="none"/></g>
 </Cam>;
 if(kind==='stalk')return <Cam x={mix(1140,1380,e(f,0,duration))} y={mix(700,695,e(f,0,duration))} z={1.65}>
  <Store f={f}/><Mouse x={1000-e(f,20,70)*210} y={816} s={.72}/><ActorCat x={1450-e(f,0,duration)*55} y={811} s={1.06} f={f} crouch={.85} walk={.18}/>
  <path d="M1620 1060 Q1700 760 2040 1010Z" fill="#775A47"/>
 </Cam>;
 const p=e(f,10,62),land=e(f,61,82);
 const catX=mix(1410,750,p),catY=811-Math.sin(p*Math.PI)*240;
 return <Cam x={mix(1210,853,p)} y={mix(660,674,land)} z={mix(1.35,1.65,p)}>
  <Store f={f}/><Mouse x={mix(975,570,e(f,0,62))} y={817} s={.74}/><g opacity={1-e(f,58,71)}><Mouse x={mix(1090,655,e(f,0,57))} y={855} s={.6}/></g>
  <ActorCat x={catX} y={catY} s={1.02} f={f} stretch={Math.sin(p*Math.PI)} crouch={land*.4}/>
  {Array.from({length:5},(_,i)=><path key={i} d={`M${catX+190+i*17} ${catY-55+i*13} l${70*(1-p)} 0`} stroke="#F4D19A" strokeWidth="4" opacity={Math.sin(p*Math.PI)*.65}/>)}
  {[0,1,2].map(i=><ellipse key={i} cx={765+i*32} cy={826-land*15} rx={land*25+i*2} ry={land*9} fill="#DDBC91" opacity={(1-e(f,84,99))*.7}/>)}
 </Cam>;
};

const Choose:React.FC<{f:number;duration:number}>=({f,duration})=>{
 const walk=e(f,40,145),pet=e(f,140,178);
 return <Cam x={mix(1010,1080,e(f,0,duration))} y={mix(605,647,e(f,0,duration))} z={mix(1.1,1.45,e(f,0,duration))}>
  <Dunes f={f}/><Granary x={400} y={570} s={1.4}/>
  <g transform="translate(1320 665)"><path d="M-60 0 L-81 160 M36 0 L55 159" stroke="#816350" strokeWidth="34" strokeLinecap="round"/><path d="M-83 -153 L72 -153 L99 9 L-95 9Z" fill="#E8D8A8"/><circle cx="-8" cy="-201" r="48" fill="#BA8865"/><path d="M-66 -225 Q-10 -281 53 -224 L84 -212 L-91 -212Z" fill="#AF824D"/><path d="M-75 -110 Q-141 -18 -195 22" stroke="#BA8865" strokeWidth="26" fill="none" strokeLinecap="round"/></g>
  <Hand x={1128} y={687+Math.sin(f/25)*pet*5} s={.8} angle={-11} color="#BA8865"/>
  <ActorCat x={mix(735,1025,walk)} y={811+Math.sin(f*.3)*2*(1-pet)} s={1.0} f={f} faceRight walk={(1-pet)*.8}/>
  <g opacity={e(f,42,56)*(1-e(f,112,126))}><Text x={960} y={268} size={67} color="#684F43">Domestikasi mandiri</Text></g>
 </Cam>;
};

const Patrol:React.FC<{f:number;duration:number}>=({f,duration})=>{
 const scroll=e(f,0,duration)*1960;
 return <>
  <rect width="1920" height="1080" fill="#BFDAD6"/>
  <path d="M-50 820 Q960 702 2000 820 L2000 1200 L-50 1200Z" fill="#7DA994"/>
  <g transform={`translate(${-scroll} 0)`}>
   <g transform="translate(650 450)"><Granary x={0} y={0} s={1.86} modern/><rect x="-310" y="160" width="184" height="167" fill="#B18563"/><path d="M-299 176 L-143 308 M-145 176 L-299 308" stroke="#D4AA7D" strokeWidth="10"/></g>
   <path d="M1500 350 Q1800 150 2120 349 Q2460 80 2910 380 L2910 800 L1500 800Z" fill="#91BFA8"/>
   {Array.from({length:24},(_,i)=><Wheat key={i} x={1610+i*53} y={755+(i%3)*33} s={.72+(i%3)*.13} angle={Math.sin(f/24+i)*9}/>)}
   <path d="M1240 980 L1550 545 M1700 1020 L1840 600 M2260 1060 L2260 580 M2810 1000 L2640 580" stroke="#B6CE9B" strokeWidth="20"/>
  </g>
  <ellipse cx="970" cy="859" rx="193" ry="23" fill="#4D7B70" opacity=".25"/>
  <ActorCat x={960} y={830} s={1.12} f={f} walk={1} faceRight/>
  <g transform={`translate(${-scroll*.4} 0)`}>{Array.from({length:11},(_,i)=><Wheat key={i} x={-150+i*270} y={1220} s={1.6} angle={Math.sin(f/23+i)*11}/>)}</g>
 </>;
};

const Sailing:React.FC<{f:number;duration:number}>=({f,duration})=>{
 const jump=e(f,duration-20,duration);
 return <Cam x={mix(1000,1100,e(f,0,duration))} y={mix(520,545,e(f,0,duration))} z={mix(1.0,1.3,e(f,0,duration))}>
  <rect x="-1500" y="-1200" width="5000" height="3000" fill="#9DC8CA"/>
  <circle cx="1500" cy="180" r="108" fill="#F8D997"/>
  <path d="M-1500 724 Q300 650 1600 723 L3500 698 L3500 1800 L-1500 1800Z" fill="#3D8798"/>
  {[0,1,2,3,4].map(i=><path key={i} d={`M-1000 ${770+i*69} Q${-300+Math.sin(f/25+i)*30} ${727+i*69} 400 ${770+i*69} T1800 ${770+i*69} T3200 ${770+i*69}`} stroke={i%2?'#78B6BE':'#63A8B2'} strokeWidth="8" fill="none"/>)}
  <Ship x={966} y={489} s={2.2} frame={f}/>
  <ActorCat x={mix(1020,1110,e(f,0,duration))} y={mix(629,440,jump)} s={.78} f={f} walk={1-jump} faceRight stretch={jump}/>
  <g transform={`translate(${-f*3} 0)`}><path d="M220 256 Q243 228 265 250 Q290 222 308 250 M1560 320 Q1580 298 1600 317 Q1620 296 1641 318" fill="none" stroke="#E4EFE1" strokeWidth="6"/></g>
 </Cam>;
};

const Together:React.FC<{kind:string;f:number;duration:number}>=({kind,f,duration})=>{
 const progress=e(f,0,duration);
 const settle=e(f,24,duration);
 const z=kind==='leap'?mix(1.05,1.15,settle):kind==='lap'?mix(1.15,1.48,progress):mix(1.7,1.91,progress);
 const x=kind==='calm'?1118:kind==='lap'?1130:mix(1000,1130,settle);
 const y=kind==='calm'?550:kind==='lap'?590:mix(550,590,settle);
 const landing=e(f,0,24);
 return <Cam x={x} y={y} z={z}>
  <Room f={f} night/>
  <Human x={1145} y={600} s={1.18} f={f} relax={kind==='leap'?landing:1}/>
  {kind==='leap'?<ActorCat x={mix(1060,1120,landing)} y={mix(419,739,landing)-Math.sin(landing*Math.PI)*103} s={mix(.82,.77,landing)} f={f} stretch={1-landing} faceRight/>:<Sleeper x={1120} y={739} s={.77} f={f}/>}
  {kind!=='leap'&&<Hand x={1093+Math.sin(f/22)*13} y={632+Math.sin(f/22)*5} s={.72} angle={11}/>}
  {kind==='leap'&&<g opacity={e(f,24,38)}><Hand x={1093+Math.sin(f/22)*13} y={632+Math.sin(f/22)*5} s={.72} angle={11}/></g>}
  {kind==='calm'&&[0,1].map(i=><g key={i} opacity=".24"><path d={`M${1070+i*54} ${505+Math.sin(f/25+i)*7} Q${1050+i*54} 472 ${1070+i*54} 446`} stroke="#EBD6AC" strokeWidth="3" fill="none"/></g>)}
 </Cam>;
};

const Desk:React.FC<{kind:string;f:number;duration:number}>=({kind,f,duration})=>{
 const close=kind==='work';
 const stop=e(f,35,75);
 return <Cam x={close?1050:1060} y={close?661:570} z={close?mix(1.62,1.82,e(f,0,duration)):mix(1.02,1.12,e(f,0,duration))}>
  <Room f={f} night desk/>
  <Human x={1250} y={665} f={f} relax={close?stop:0} s={1.18}/>
  <path d="M630 777 L1640 777 M695 779 L665 1100 M1574 779 L1604 1100" stroke="#A46F58" strokeWidth="27" strokeLinecap="round"/>
  <path d="M920 753 L1190 753 L1240 767 L954 767Z" fill="#F2DDB8"/>
  <g transform={`translate(${1150+(1-stop)*Math.sin(f*.33)*14} 711) rotate(${-27+stop*32})`}><path d="M0 -37 L0 45" stroke="#E6B659" strokeWidth="9"/><path d="M-4 46 L4 46 L0 58Z" fill="#24304A"/></g>
  <Hand x={1150+stop*14} y={701-stop*53} s={.78} angle={-8+stop*16}/>
  <ActorCat x={close?970+stop*83:mix(510,956,e(f,0,duration))} y={748} s={.9} f={f} faceRight walk={close?1-stop:1}/>
  {close&&<g opacity={e(f,37,50)*(1-e(f,92,108))}><Text x={960} y={262} size={65} color="#FFE2AA">Nilai bukan hanya kerja.</Text></g>}
 </Cam>;
};

const Touch:React.FC<{f:number;duration:number}>=({f,duration})=><>
 <rect width="1920" height="1080" fill="#BB8781"/>
 <path d="M-100 900 Q920 700 2100 940 L2100 1200 L-100 1200Z" fill="#A97478"/>
 <CatHead x={900} y={572} s={3.7} f={f} asleep tilt={Math.sin(f/26)*3-7}/>
 <Hand x={950+Math.sin(f/21)*37} y={343+Math.sin(f/21)*15} s={2.5} angle={9+Math.sin(f/26)*3}/>
 {[0,1,2].map(i=>{
  const p=((f+i*30)%110)/110;
  return <g key={i} opacity={Math.sin(p*Math.PI)*.45}><Heart x={1260+i*110+p*25} y={530-p*220} s={.21+i*.07} color="#F0BAA5"/></g>;
 })}
</>;

const Ending:React.FC<{f:number;duration:number}>=({f,duration})=>{
 const p=e(f,0,duration);
 return <Cam x={mix(1100,960,p)} y={mix(580,552,p)} z={mix(1.65,.99,p)}>
  <Room f={f} night/><Human x={1145} y={600} s={1.18} f={f} relax={1}/><Sleeper x={1120} y={739} s={.77} f={f} stars/>
  <Hand x={1095+Math.sin(f/25)*7} y={633} s={.72} angle={11}/>
 </Cam>;
};

export const StoryShot:React.FC<{shot:Shot}>=({shot})=>{
 const f=useCurrentFrame(),global=f+shot.from;
 const {id,duration}=shot;
 const earth=id==='earth';
 return <AbsoluteFill style={{background:earth?P.night:P.cream,overflow:'hidden'}}>
  {earth&&<Earth/>}
  <svg width="1920" height="1080" viewBox="0 0 1920 1080" style={{position:'absolute',inset:0}}>
   {['room','sleep','glass','stare'].includes(id)?<HomeOpening kind={id} f={f} duration={duration} global={global}/>:null}
   {id==='ancient'||id==='harvest'?<Ancient kind={id} f={f} duration={duration}/>:null}
   {earth&&<>
    <defs><mask id="starfield"><rect width="1920" height="1080" fill="white"/><circle cx="1032" cy="556" r="403" fill="black"/></mask></defs>
    <g mask="url(#starfield)">{Array.from({length:35},(_,i)=><Star key={i} x={73+i*157%1800} y={65+i*113%920} s={2+i%3} color={i%2?'#C6D7D9':'#E7C994'} rotation={i*21}/>)}</g>
    <g opacity={e(f,4,17)*(1-e(f,duration-17,duration-2))}><Text x={960} y={123} size={92} color="#FFE0A0">±10.000 tahun lalu</Text><Text x={1585} y={670} size={26} color="#E8E5D0">BULAN SABIT SUBUR</Text><path d="M1500 638 L1200 382" stroke="#F9D387" strokeWidth="3" fill="none"/></g>
   </>}
   {['grain','stalk','chase'].includes(id)?<Hunt kind={id} f={f} duration={duration}/>:null}
   {id==='choose'?<Choose f={f} duration={duration}/>:null}
   {id==='patrol'?<Patrol f={f} duration={duration}/>:null}
   {id==='ship'?<Sailing f={f} duration={duration}/>:null}
   {['leap','lap','calm'].includes(id)?<Together kind={id} f={f} duration={duration}/>:null}
   {id==='desk'||id==='work'?<Desk kind={id} f={f} duration={duration}/>:null}
   {id==='touch'?<Touch f={f} duration={duration}/>:null}
   {id==='ending'?<Ending f={f} duration={duration}/>:null}
  </svg>
 </AbsoluteFill>;
};
