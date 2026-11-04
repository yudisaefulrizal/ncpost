import React,{useEffect,useMemo} from 'react';
import {ThreeCanvas} from '@remotion/three';
import * as THREE from 'three';
import {SVGLoader} from 'three/examples/jsm/loaders/SVGLoader.js';
import type {Asset,CameraPose,Entity,Pose} from './types';
import {sample} from './motion';

const MeshAsset:React.FC<{entity:Entity;asset:Asset;pose:Pose;camera:CameraPose}>=({entity,asset,pose,camera})=>{
 const parts=useMemo(()=>{
  const document=new SVGLoader().parse(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="-200 -200 400 400">${asset.markup}</svg>`);
  return document.paths.filter(p=>(p.userData?.style as {fill?:string}|undefined)?.fill!=='none').flatMap(p=>SVGLoader.createShapes(p).map(shape=>{
   const geometry=new THREE.ExtrudeGeometry(shape,{depth:entity.depth,bevelEnabled:true,bevelThickness:1,bevelSize:1,bevelSegments:1,steps:1,curveSegments:10});
   geometry.translate(0,0,-entity.depth/2);
   return {geometry,color:p.color,opacity:Number((p.userData?.style as {fillOpacity?:number|string}|undefined)?.fillOpacity??1)};
  }));
 },[asset.markup,entity.depth]);
 useEffect(()=>()=>parts.forEach(part=>part.geometry.dispose()),[parts]);
 const scale=pose.scale*camera.zoom;
 return <group position={[(pose.x-camera.x)*camera.zoom,-(pose.y-camera.y)*camera.zoom,0]} scale={[scale,-scale,scale]} rotation={[THREE.MathUtils.degToRad(pose.rotationX),THREE.MathUtils.degToRad(pose.rotationY),-THREE.MathUtils.degToRad(pose.rotation)]}>
  {parts.map((part,i)=><mesh key={i} geometry={part.geometry}><meshStandardMaterial color={part.color} roughness={.86} metalness={0} transparent opacity={pose.opacity*part.opacity} side={THREE.DoubleSide}/></mesh>)}
 </group>;
};

export const SolidLayer:React.FC<{entities:Entity[];assets:Asset[];progress:number;camera:CameraPose}>=({entities,assets,progress,camera})=><div style={{position:'absolute',left:0,top:0,width:960,height:540,transform:'scale(2)',transformOrigin:'0 0',pointerEvents:'none'}}>
 <ThreeCanvas width={960} height={540} dpr={1} orthographic camera={{position:[0,0,2500],near:1,far:10000,zoom:.5}} gl={{alpha:true,antialias:true}}>
  <ambientLight intensity={1.8}/><directionalLight position={[-500,700,1800]} intensity={2.6}/><directionalLight position={[600,-400,900]} intensity={.6}/>
  {entities.map(entity=><MeshAsset key={entity.id} entity={entity} asset={assets.find(asset=>asset.id===entity.assetId)!} pose={sample(entity.keyframes,progress,entity.easing)} camera={camera}/>)}
 </ThreeCanvas>
</div>;
