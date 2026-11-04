import timeline from './timeline.json';

const at=(paragraph:number,seconds:number)=>timeline.scenes[paragraph].from+timeline.scenes[paragraph].audioLead+Math.round(seconds*30);
const cuts=[0,at(0,3.8),at(0,5.45),at(0,7.45),timeline.scenes[1].from,at(1,3.4),at(1,8.6),timeline.scenes[2].from,at(2,2.4),at(2,4.8),timeline.scenes[3].from,at(3,6.1),at(3,10.7),timeline.scenes[4].from,at(4,3.2),at(4,6.4),timeline.scenes[5].from,at(5,3.6),at(5,7.8),at(5,10.6),timeline.durationInFrames];
const ids=['room','sleep','glass','stare','ancient','harvest','earth','grain','stalk','chase','choose','patrol','ship','leap','lap','calm','desk','work','touch','ending'] as const;
const actions=[
 'Kamera mendekati kucing yang tidur di ruang tamu.',
 'Detail wajah, napas, telinga dan dengkuran kucing.',
 'Cakar mendorong gelas; kamera mengikuti jatuhnya gelas.',
 'Kucing membuka mata dan menatap penonton; match cut ke kucing liar.',
 'Kamera menjauh dari wajah kucing liar, mengungkap permukiman purba.',
 'Manusia membawa hasil panen; biji gandum mengalir masuk lumbung.',
 'Kamera melintasi bumi Three.js menuju Bulan Sabit Subur.',
 'Biji gandum memenuhi lantai, tikus mengendus lalu datang makan.',
 'Kamera mengikuti tikus; kucing merendah dan mengintai.',
 'Tikus berlari, kucing menerkam dan mendarat di ambang lumbung.',
 'Kucing mendekati tangan manusia atas pilihannya sendiri.',
 'Tracking mengikuti kucing; gudang berganti ladang tanpa kartu ikon.',
 'Gerak patroli bersambung di atas kapal yang berlayar.',
 'Lompatan kucing di kapal disambung dengan lompatan ke sofa.',
 'Kucing mendarat di pangkuan; manusia mengelusnya.',
 'Detail napas dan tangan; ketegangan bahu manusia melunak.',
 'Kucing berjalan di meja ketika manusia masih bekerja.',
 'Kucing menyentuh tangan; pensil berhenti, manusia menoleh.',
 'Detail tangan membalas sentuhan kucing.',
 'Kamera menjauh, mengungkap manusia dan kucing dalam ruang hangat.',
];
export const shots=ids.map((id,i)=>({id,from:cuts[i],duration:cuts[i+1]-cuts[i],action:actions[i]}));
export type Shot=(typeof shots)[number];
