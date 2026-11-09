"""Compose a quiet, original pentatonic ambient bed and timed scene accents."""
import json
import wave
import os
import tempfile
from pathlib import Path
import numpy as np

ROOT=Path(__file__).resolve().parents[1]
WORK=Path(os.environ.get('PIPELINE_WORK_DIR',str(ROOT/'styles/vektor-kucing/contoh')))
PUBLIC=Path(os.environ.get('PIPELINE_PUBLIC_DIR',str(ROOT/'public')))
manifest=json.loads((WORK/'timeline.json').read_text())
SR=44100
duration=manifest['durationInFrames']/manifest['fps']
audio=np.zeros((int((duration+.25)*SR),2),dtype=np.float64)

def add_note(start,length,midi,gain=.1,pan=0,kind='bell'):
    count=min(int(length*SR),len(audio)-int(start*SR))
    if count<=0: return
    t=np.arange(count)/SR
    hz=440*2**((midi-69)/12)
    if kind=='pad':
        env=np.minimum(t/1.1,1)*np.minimum((length-t)/1.8,1)
        signal=(np.sin(2*np.pi*hz*t)+.25*np.sin(2*np.pi*hz*2.002*t))*env
    else:
        env=(1-np.exp(-t*65))*np.exp(-t*2.1)
        signal=(np.sin(2*np.pi*hz*t)+.27*np.sin(2*np.pi*hz*2*t)+.06*np.sin(2*np.pi*hz*3*t))*env
    signal*=gain
    left=np.sqrt((1-pan)/2)
    right=np.sqrt((1+pan)/2)
    at=int(start*SR)
    audio[at:at+count,0]+=signal*left
    audio[at:at+count,1]+=signal*right

chords=[[48,55,60,64],[45,52,57,60],[41,48,53,57],[43,50,55,59]]
for i,start in enumerate(np.arange(0,duration,6.4)):
    for j,note in enumerate(chords[i%4]):
        add_note(float(start),8,note,.027,(j-1.5)*.32,'pad')
    for j,note in enumerate([72,76,79,76,74,72,67,71]):
        add_note(float(start)+j*.8,2.3,note+(0 if i%4<2 else -2),.036 if j%2==0 else .024,np.sin(j*1.7)*.55)

# Generic projects derive accents from actual animated actions, not paragraphs.
if os.environ.get('PIPELINE_PROJECT_ID'):
    props_path=WORK/'render-props.json'
    props=json.loads(props_path.read_text()) if props_path.exists() and not os.environ.get('PIPELINE_AUTHORED_SOURCE') else {'plan': {'shots': []}}
    for i,shot in enumerate(props['plan']['shots']):
        accent=shot.get('accent')
        if not accent: continue
        start=(shot['from']+shot['duration']*accent['at'])/manifest['fps']
        if accent['kind']=='water':
            at=int(start*SR)
            count=min(int(.75*SR),len(audio)-at)
            if count>0:
                rng=np.random.default_rng(i+31)
                noise=np.convolve(rng.normal(0,1,count),np.ones(11)/11,mode='same')
                envelope=np.sin(np.linspace(0,np.pi,count))**2
                splash=noise*envelope*.065
                audio[at:at+count,0]+=splash
                audio[at:at+count,1]+=splash*.87
            continue
        notes={'soft':[60,67], 'impact':[48,43], 'chime':[72,79,84], 'water':[79,76,72]}[accent['kind']]
        for j,note in enumerate(notes):
            add_note(start+j*.045,.8,note,.065,(j-1)*.2)
else:
    # Original approved movie retains its authored soundtrack.
    for j,note in enumerate([96,102,88]):
        add_note(7.6+j*.035,.5,note,.15)
    for j,note in enumerate([60,55,48]):
        add_note(29.75+j*.025,.4,note,.10)
    for j,note in enumerate([72,79,84]):
        add_note(manifest['scenes'][1]['from']/30+8.6+j*.12,1.8,note,.07,(j-1)*.4)

fade_in=np.minimum(np.arange(len(audio))/SR/2,1)
fade_out=np.clip((duration-np.arange(len(audio))/SR)/3,0,1)
audio*=fade_in[:,None]*fade_out[:,None]
pcm=(np.clip(audio,-.95,.95)*32767).astype('<i2')
scratch_root=Path(os.environ.get('TMPDIR',str(ROOT/'.cache/video-pipeline/audio-work')))
scratch_root.mkdir(parents=True,exist_ok=True)
with tempfile.TemporaryDirectory(prefix='score-',dir=scratch_root) as scratch:
    pending=Path(scratch)/'score.wav'
    with wave.open(str(pending),'wb') as output:
        output.setnchannels(2)
        output.setsampwidth(2)
        output.setframerate(SR)
        output.writeframes(pcm.tobytes())
    (PUBLIC/'audio').mkdir(parents=True,exist_ok=True)
    pending.replace(PUBLIC/'audio/score.wav')
print(f'Original score: {duration:.2f}s, stereo 44.1 kHz')
