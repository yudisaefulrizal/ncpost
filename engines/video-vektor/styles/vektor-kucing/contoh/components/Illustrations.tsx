import React from 'react';

export const C = {ink:'#202846', orange:'#F39643', orangeDark:'#D96A32', orangeLight:'#FFC16A', cream:'#FFF1D6', teal:'#258F89', mint:'#76C6AB', navy:'#293D66', purple:'#7C77C8', pink:'#EE8F9D', gold:'#E9B655'};

export const Star: React.FC<{x:number;y:number;s?:number;color?:string;rotation?:number}> = ({x,y,s=12,color=C.gold,rotation=0}) => <path transform={`translate(${x} ${y}) rotate(${rotation}) scale(${s/12})`} d="M0 -13 Q2 -2 13 0 Q2 2 0 13 Q-2 2 -13 0 Q-2 -2 0 -13Z" fill={color}/>;

export const Cat: React.FC<{x?:number;y?:number;s?:number;asleep?:boolean;frame?:number;flip?:boolean;tail?:boolean}> = ({x=0,y=0,s=1,asleep=false,frame=0,flip=false,tail=true}) => {
 const breath = Math.sin(frame/23)*2;
 const blink = frame%137>129;
 return <g transform={`translate(${x} ${y}) scale(${flip?-s:s} ${s})`}>
   {tail&&<path d={`M105 55 C222 85 247 -8 206 -59 C184 -86 155 -68 168 -47 C197 -10 164 31 121 14`} fill="none" stroke={C.orangeDark} strokeWidth="43" strokeLinecap="round"/>}
   <ellipse cx="0" cy={36+breath} rx="146" ry={92-breath} fill={C.orange}/>
   <ellipse cx="-7" cy="85" rx="104" ry="37" fill={C.orangeLight}/>
   <path d="M19 -48 Q33 -5 9 5 M58 -39 Q67 -9 52 2 M99 -18 Q104 4 88 16" fill="none" stroke={C.orangeDark} strokeWidth="14" strokeLinecap="round"/>
   <path d="M-132 -47 L-141 -133 Q-139 -142 -129 -134 L-77 -95 L-32 -99 L15 -137 Q25 -144 25 -130 L22 -57Z" fill={C.orange}/>
   <path d="M-128 -115 L-119 -72 L-91 -91Z M11 -116 L-18 -91 L11 -75Z" fill="#D96761"/>
   <ellipse cx="-57" cy="-42" rx="90" ry="76" fill={C.orangeLight}/>
   <path d="M-83 -110 L-73 -86 M-54 -116 L-53 -86 M-23 -109 L-31 -85" fill="none" stroke={C.orangeDark} strokeWidth="11" strokeLinecap="round"/>
   <ellipse cx="-83" cy="-19" rx="29" ry="23" fill="#FFD69A"/><ellipse cx="-34" cy="-19" rx="29" ry="23" fill="#FFD69A"/>
   {asleep||blink?<g fill="none" stroke={C.ink} strokeWidth="6" strokeLinecap="round"><path d="M-109 -48 Q-94 -35 -80 -48"/><path d="M-40 -48 Q-25 -35 -12 -48"/></g>:<g><ellipse cx="-94" cy="-48" rx="17" ry="21" fill="#FAF3DF"/><ellipse cx="-26" cy="-48" rx="17" ry="21" fill="#FAF3DF"/><ellipse cx="-89" cy="-47" rx="7" ry="14" fill={C.ink}/><ellipse cx="-21" cy="-47" rx="7" ry="14" fill={C.ink}/><circle cx="-86" cy="-53" r="3" fill="white"/><circle cx="-18" cy="-53" r="3" fill="white"/></g>}
   <path d="M-66 -27 Q-58 -34 -50 -27 L-58 -19Z" fill="#A64D50"/>
   <path d="M-58 -20 L-58 -12 M-58 -12 Q-68 -1 -77 -10 M-58 -12 Q-48 -1 -39 -10" stroke={C.ink} strokeWidth="3.5" fill="none" strokeLinecap="round"/>
   <g stroke="#B57348" strokeWidth="3" strokeLinecap="round"><path d="M-113 -22 L-152 -29 M-113 -12 L-152 -9 M-7 -22 L31 -29 M-7 -12 L31 -9"/></g>
   <ellipse cx="-92" cy="108" rx="43" ry="20" fill={C.orangeLight}/><ellipse cx="39" cy="108" rx="46" ry="20" fill={C.orangeLight}/>
   <path d="M-110 109 L-110 117 M-94 110 L-94 119 M22 110 L22 119 M39 111 L39 120" stroke={C.orangeDark} strokeWidth="3" strokeLinecap="round"/>
 </g>;
};

export const Sofa:React.FC<{x?:number;y?:number;s?:number;warm?:boolean}>=({x=0,y=0,s=1,warm=false})=><g transform={`translate(${x} ${y}) scale(${s})`}>
 <ellipse cx="0" cy="163" rx="337" ry="27" fill={C.ink} opacity=".09"/>
 <path d="M-265 105 L-276 160 L-253 160 L-230 105 M240 105 L253 160 L276 160 L268 105" fill={C.navy}/>
 <rect x="-292" y="-161" width="584" height="246" rx="65" fill={warm?'#BC6C73':'#5DA59F'}/>
 <rect x="-261" y="-137" width="247" height="167" rx="33" fill={warm?'#D48887':'#82BBB0'}/><rect x="12" y="-137" width="247" height="167" rx="33" fill={warm?'#CE8084':'#75B0A6'}/>
 <rect x="-277" y="18" width="554" height="97" rx="27" fill={warm?'#AB596B':'#3A827E'}/>
 <rect x="-266" y="8" width="253" height="46" rx="20" fill={warm?'#E19A92':'#91C9B7'}/><rect x="7" y="8" width="253" height="46" rx="20" fill={warm?'#DA8C8D':'#88BEAF'}/>
 <rect x="-326" y="-54" width="78" height="173" rx="33" fill={warm?'#C47C80':'#6AA99F'}/><rect x="248" y="-54" width="78" height="173" rx="33" fill={warm?'#C47C80':'#6AA99F'}/>
 <path d="M-206 -113 L-153 -124 L-113 -45 L-178 -21 L-227 -53Z" fill={warm?'#EFC27D':'#E7CE87'}/>
</g>;

export const Plant:React.FC<{x:number;y:number;s?:number;color?:string}>=({x,y,s=1,color=C.teal})=><g transform={`translate(${x} ${y}) scale(${s})`}>
 <path d="M0 0 Q-20 -95 9 -203 M0 -36 Q-70 -75 -84 -123 M-5 -76 Q57 -101 67 -160" fill="none" stroke={color} strokeWidth="7"/>
 <path d="M8 -175 Q-47 -188 -28 -243 Q25 -242 8 -175 M-4 -110 Q-59 -113 -58 -170 Q-8 -161 -4 -110 M14 -164 Q12 -218 63 -215 Q69 -168 14 -164 M-50 -85 Q-106 -75 -111 -129 Q-63 -144 -50 -85 M39 -117 Q35 -170 89 -176 Q100 -127 39 -117" fill={color}/>
 <path d="M-56 -4 L-41 82 Q0 104 41 82 L56 -4Z" fill="#DC9879"/><ellipse cy="-4" rx="56" ry="12" fill="#E8AD89"/>
</g>;

export const Wheat:React.FC<{x:number;y:number;s?:number;angle?:number}>=({x,y,s=1,angle=0})=><g transform={`translate(${x} ${y}) rotate(${angle}) scale(${s})`}>
 <path d="M0 12 L0 -151 M0 -45 Q-25 -72 -35 -61 M0 -77 Q27 -96 36 -89" fill="none" stroke="#B87B36" strokeWidth="5" strokeLinecap="round"/>
 {Array.from({length:5},(_,i)=><g key={i} transform={`translate(0 ${-50-i*22})`}><ellipse cx="-13" cy="-11" rx="9" ry="19" fill={i%2?'#F4C865':'#E7AD45'} transform="rotate(-40 -13 -11)"/><ellipse cx="13" cy="-11" rx="9" ry="19" fill="#F8D478" transform="rotate(40 13 -11)"/></g>)}
 <ellipse cy="-174" rx="8" ry="20" fill="#F9D982"/>
</g>;

export const Mouse:React.FC<{x:number;y:number;s?:number;flip?:boolean}>=({x,y,s=1,flip=false})=><g transform={`translate(${x} ${y}) scale(${flip?-s:s} ${s})`}>
 <path d="M27 8 Q87 29 78 -9 Q73 -26 91 -29" fill="none" stroke="#D89AA0" strokeWidth="7" strokeLinecap="round"/>
 <ellipse cx="0" cy="0" rx="47" ry="28" fill="#8A8DA1"/><path d="M-19 -20 Q-62 -15 -69 6 L-27 20" fill="#A8A8B7"/>
 <circle cx="-28" cy="-25" r="20" fill="#A8A8B7"/><circle cx="-28" cy="-25" r="12" fill="#D9A2AD"/><circle cx="-49" cy="-3" r="4" fill={C.ink}/><circle cx="-68" cy="7" r="5" fill="#D98D9A"/>
 <path d="M-52 9 L-83 3 M-52 13 L-79 20" stroke={C.ink} strokeWidth="2"/>
</g>;

export const Granary:React.FC<{x:number;y:number;s?:number;modern?:boolean}>=({x,y,s=1,modern=false})=><g transform={`translate(${x} ${y}) scale(${s})`}>
 <ellipse cy="165" rx="216" ry="22" fill={C.ink} opacity=".08"/>
 <rect x="-164" y="-80" width="328" height="231" rx="9" fill={modern?'#75A5BC':'#DCAC70'}/><path d="M-190 -72 L0 -211 L190 -72Z" fill={modern?'#3C6384':'#B76E48'}/>
 <path d="M-147 -82 L0 -187 L145 -82" fill="none" stroke={modern?'#547E9C':'#CE8B53'} strokeWidth="12"/>
 <rect x="-49" y="-12" width="98" height="163" rx="48" fill={modern?'#365B77':'#885938'}/><rect x="-24" y="18" width="48" height="133" fill={modern?'#24495D':'#684A33'}/>
 <path d="M-149 16 L-65 16 M64 16 L150 16 M-149 60 L-65 60 M64 60 L150 60 M-149 105 L-65 105 M64 105 L150 105" stroke={modern?'#91BBCB':'#E7BF88'} strokeWidth="5"/>
 <circle cy="-105" r="25" fill={modern?'#BBD9DD':'#EFC88D'}/><path d="M0 -121 L0 -89 M-16 -105 L16 -105" stroke={modern?'#47738A':'#B4794A'} strokeWidth="5"/>
</g>;

export const Ship:React.FC<{x:number;y:number;s?:number;frame:number}>=({x,y,s=1,frame})=><g transform={`translate(${x} ${y+Math.sin(frame/28)*5}) scale(${s})`}>
 <path d="M-173 62 L167 62 L109 142 L-110 142Z" fill={C.navy}/><path d="M-164 66 L151 66 L133 89 L-147 89Z" fill="#5F7E9C"/>
 <path d="M-4 66 L-4 -199" stroke="#BA835D" strokeWidth="9"/><path d="M-19 -177 L-139 29 L-19 29Z" fill="#F3D596"/><path d="M12 -162 Q45 -130 132 28 L12 28Z" fill="#FFF1C9"/>
 <path d="M-202 158 Q-178 144 -154 158 T-106 158 T-58 158 T-10 158 T38 158 T86 158 T134 158 T182 158" fill="none" stroke="#6EC9CB" strokeWidth="8" strokeLinecap="round"/>
 <path d="M-4 -199 L61 -181 L-4 -163Z" fill={C.orange}/>
 {[0,1,2,3].map(i=><circle key={i} cx={-77+i*49} cy="111" r="9" fill="#A8D9DD"/>)}
</g>;

export const Heart:React.FC<{x:number;y:number;s?:number;color?:string}>=({x,y,s=1,color=C.pink})=><path transform={`translate(${x} ${y}) scale(${s})`} d="M0 15 C-65 -22 -49 -66 -19 -56 Q-4 -53 0 -36 Q6 -58 24 -57 C57 -57 62 -17 0 15Z" fill={color}/>;

export const Person:React.FC<{x:number;y:number;s?:number;frame:number}>=({x,y,s=1,frame})=><g transform={`translate(${x} ${y}) scale(${s})`}>
 <path d="M-68 107 L-90 220 L-7 229 L20 122 M27 117 L38 224 L115 219 L94 99" fill="#3A4568"/>
 <path d="M-91 -82 Q0 -131 78 -70 L112 120 Q18 151 -95 121Z" fill="#7C88BB"/>
 <path d="M-24 -115 L-25 -78 Q1 -49 25 -80 L22 -122Z" fill="#CF8F75"/>
 <ellipse cy="-168" rx="65" ry="76" fill="#DFA68B"/><path d="M-67 -158 Q-90 -249 -7 -255 Q90 -255 64 -148 L43 -174 L37 -211 Q-19 -187 -56 -207Z" fill={C.ink}/>
 <path d="M-33 -158 Q-24 -151 -16 -158 M15 -158 Q23 -151 32 -158 M-15 -129 Q1 -114 17 -132" fill="none" stroke="#7C4D4C" strokeWidth="4" strokeLinecap="round"/>
 <path d="M-72 -53 Q-140 22 -74 54 L40 66 M73 -45 Q131 29 64 52 L-22 62" fill="none" stroke="#DFA68B" strokeWidth="27" strokeLinecap="round"/>
 <Cat x={3} y={53} s={.55} asleep frame={frame}/>
</g>;
