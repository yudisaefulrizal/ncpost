import React,{useMemo} from 'react';
import {ThreeCanvas} from '@remotion/three';
import {useCurrentFrame,interpolate} from 'remotion';
import * as THREE from 'three';

const point=(lat:number,lon:number,r=2.52)=>{
 const a=THREE.MathUtils.degToRad(lat),b=THREE.MathUtils.degToRad(lon);
 return new THREE.Vector3(Math.sin(b)*Math.cos(a)*r,Math.sin(a)*r,Math.cos(b)*Math.cos(a)*r);
};
const regions=[
 [[36,-10],[50,-10],[59,10],[70,26],[60,55],[51,42],[42,29],[36,22]],
 [[35,-15],[34,30],[10,51],[-9,40],[-35,18],[-25,5],[3,-14]],
 [[40,29],[65,50],[70,110],[50,155],[25,121],[7,105],[10,76],[28,57]],
 [[20,-110],[36,-125],[61,-141],[66,-75],[46,-52],[22,-86]],
 [[10,-79],[4,-50],[-20,-36],[-54,-70],[-20,-80]],
 [[-13,115],[-10,141],[-37,153],[-42,130],[-23,113]],
];
const Land:React.FC<{points:number[][]}>=({points})=>{
 const geometry=useMemo(()=>{
  const center=points.reduce((p,q)=>[p[0]+q[0]/points.length,p[1]+q[1]/points.length],[0,0]);
  const vertices:number[]=[];
  // Subdivide before projecting: large flat triangles would sink into the ocean.
  const n=16;
  for(let k=0;k<points.length;k++){
   const b=points[k],c=points[(k+1)%points.length];
   const p=(i:number,j:number)=>point(center[0]+(b[0]-center[0])*i/n+(c[0]-center[0])*j/n,center[1]+(b[1]-center[1])*i/n+(c[1]-center[1])*j/n,2.54).toArray();
   for(let i=0;i<n;i++)for(let j=0;j<n-i;j++){
    vertices.push(...p(i,j),...p(i+1,j),...p(i,j+1));
    if(i+j<n-1)vertices.push(...p(i+1,j),...p(i+1,j+1),...p(i,j+1));
   }
  }
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));g.computeVertexNormals();return g;
 },[points]);
 return <mesh geometry={geometry}><meshBasicMaterial color="#80C6A5" side={THREE.DoubleSide}/></mesh>;
};
export const Earth:React.FC=()=>{
 const f=useCurrentFrame();
 const rotation=interpolate(f,[0,85],[.25,-.62],{extrapolateRight:'clamp'});
 return <div style={{position:'absolute',left:0,top:0,width:960,height:540,transform:'scale(2)',transformOrigin:'0 0'}}>
  <ThreeCanvas width={960} height={540} orthographic camera={{position:[0,0,10],zoom:80}} dpr={1} gl={{alpha:true,antialias:true}}>
   <ambientLight intensity={1.6}/><directionalLight position={[-4,5,8]} intensity={2.5}/>
   <group rotation={[.09,rotation,-.12]} position={[.45,-.1,0]}>
    <mesh><sphereGeometry args={[2.5,40,32]}/><meshStandardMaterial color="#3774A0" roughness={1}/></mesh>
    {regions.map((p,i)=><Land key={i} points={p}/>)}
    <mesh position={point(33,40,2.57)}><sphereGeometry args={[.085,12,8]}/><meshBasicMaterial color="#FFE3A1"/></mesh>
    {[0,1,2].map(i=><mesh key={i} position={point(33,40,2.57)} scale={1+((f+i*20)%60)/20}>
     <sphereGeometry args={[.09,12,8]}/><meshBasicMaterial color="#FFD27D" transparent opacity={(1-((f+i*20)%60)/60)*.35}/>
    </mesh>)}
   </group>
  </ThreeCanvas>
 </div>;
};
