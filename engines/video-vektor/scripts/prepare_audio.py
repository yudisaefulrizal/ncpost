"""Generate Indonesian narration, word timing and an original ambient score."""
import asyncio
import json
import math
import subprocess
import hashlib
import os
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
FPS = 30
VOICE = os.environ.get('TTS_VOICE', 'id-ID-ArdiNeural')
RATE = os.environ.get('TTS_RATE', '-5%')

def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()

def atomic_text(path, text):
    if path.exists() and path.read_bytes() == text.encode('utf8'):
        return
    directory = Path(os.environ.get('TMPDIR', str(ROOT/'.cache/video-pipeline/audio-work')))
    directory.mkdir(parents=True, exist_ok=True)
    with tempfile.NamedTemporaryFile(mode='w', encoding='utf8', dir=directory, delete=False) as output:
        output.write(text)
        temp = Path(output.name)
    try:
        temp.chmod(path.stat().st_mode & 0o777 if path.exists() else 0o644)
        temp.replace(path)
    finally:
        temp.unlink(missing_ok=True)

async def main():
    project_dir = Path(os.environ.get('PIPELINE_PROJECT_DIR', str(ROOT)))
    public_dir = Path(os.environ.get('PIPELINE_PUBLIC_DIR', str(ROOT/'public')))
    work_dir = Path(os.environ.get('PIPELINE_WORK_DIR', str(ROOT/'src')))
    audio_dir = public_dir/'audio'
    audio_dir.mkdir(parents=True, exist_ok=True)
    work_dir.mkdir(parents=True, exist_ok=True)
    timeline_path = work_dir/'timeline.json'
    source = json.loads((project_dir/'naskah.json').read_text())
    previous = json.loads(timeline_path.read_text()) if timeline_path.exists() else {'scenes': []}
    output_dir = Path(os.environ.get('PIPELINE_STAGE', str(audio_dir)))
    output_dir.mkdir(parents=True, exist_ok=True)
    scratch_root = Path(os.environ.get('TMPDIR', str(ROOT/'.cache/video-pipeline/audio-work')))
    scratch_root.mkdir(parents=True, exist_ok=True)
    scenes = []
    cursor = 0
    for i, scene in enumerate(source):
        target = audio_dir/f'scene-{i+1}.mp3'
        timing_path = target.with_suffix('.json')
        meta_path = target.with_suffix('.meta.json')
        signature = hashlib.sha256(json.dumps({'text': scene['audio_text'], 'voice': VOICE, 'rate': RATE}, ensure_ascii=False, sort_keys=True).encode()).hexdigest()
        valid = False
        if target.exists() and timing_path.exists():
            if meta_path.exists():
                try:
                    metadata = json.loads(meta_path.read_text())
                except json.JSONDecodeError:
                    metadata = {}
                valid = metadata.get('signature') == signature and metadata.get('audio') == digest(target) and metadata.get('timing') == digest(timing_path)
            else:
                # Adopt the already approved, matching cached narration once.
                old = previous['scenes'][i] if i < len(previous['scenes']) else {}
                valid = old.get('audio_text') == scene['audio_text']
        if not valid:
            import edge_tts
            for attempt in range(3):
                try:
                    with tempfile.TemporaryDirectory(prefix='audio-', dir=scratch_root) as scratch:
                        pending = Path(scratch)/target.name
                        voice = edge_tts.Communicate(scene['audio_text'], VOICE, rate=RATE, boundary='WordBoundary')
                        words = []
                        with pending.open('wb') as audio:
                            async for chunk in voice.stream():
                                if chunk['type'] == 'audio':
                                    audio.write(chunk['data'])
                                elif chunk['type'] == 'WordBoundary':
                                    words.append({'text': chunk['text'], 'start': chunk['offset']/1e7, 'end': (chunk['offset']+chunk['duration'])/1e7})
                        if not words:
                            raise RuntimeError('TTS returned no word timing')
                        subprocess.check_output(['ffprobe','-v','error','-show_entries','format=duration',str(pending)])
                        pending.replace(target)
                        atomic_text(timing_path, json.dumps(words, ensure_ascii=False, indent=2))
                    break
                except Exception:
                    if attempt == 2:
                        raise
                    await asyncio.sleep(2)
        atomic_text(meta_path, json.dumps({'signature': signature, 'audio': digest(target), 'timing': digest(timing_path)}, indent=2))
        words = json.loads(timing_path.read_text())
        duration = float(subprocess.check_output(['ffprobe','-v','error','-show_entries','format=duration','-of','default=nw=1:nk=1',str(target)]))
        # Cut TTS container silence; keep a natural 0.25-second spoken breath.
        trim_start = 2
        trim_end = min(math.ceil((words[-1]['end'] + .14)*FPS), math.floor(duration*FPS))
        lead = 12 if i == 0 else 0
        audio_duration = (trim_end-trim_start)/FPS
        frames = trim_end-trim_start + lead + (36 if i == len(source)-1 else 2)
        words = [{**w, 'start': max(0,w['start']-trim_start/FPS), 'end': w['end']-trim_start/FPS} for w in words]
        captions = []
        for k in range(0, len(words), 7):
            group = words[k:k+7]
            captions.append({'start': group[0]['start'], 'end': words[k+7]['start'] if k+7<len(words) else audio_duration, 'words': group})
        scenes.append({**scene, 'index': i, 'from': cursor, 'durationInFrames': frames, 'audioLead': lead, 'audioDuration': audio_duration, 'audioTrimStart': trim_start, 'audioTrimEnd': trim_end, 'audioRawDuration': duration, 'captions': captions})
        cursor += frames
        print(f'Scene {i+1}: {duration:.2f}s, {frames} frames', flush=True)
    manifest = {'fps': FPS, 'durationInFrames': cursor, 'scenes': scenes}
    atomic_text(timeline_path, json.dumps(manifest, ensure_ascii=False, indent=2))
    # Export a readable, portable subtitle track from the actual speech boundaries.
    def stamp(seconds):
        ms = round(seconds*1000)
        return f'{ms//3600000:02}:{ms//60000%60:02}:{ms//1000%60:02},{ms%1000:03}'
    subtitles=[]
    for scene in scenes:
        offset=(scene['from']+scene['audioLead'])/FPS
        for caption in scene['captions']:
            subtitles.append(f"{len(subtitles)+1}\n{stamp(offset+caption['start'])} --> {stamp(offset+caption['end'])}\n{' '.join(w['text'] for w in caption['words'])}\n")
    atomic_text(output_dir/'kucing.id.srt', '\n'.join(subtitles))
    atomic_text(public_dir/'timeline.json', json.dumps(manifest, ensure_ascii=False, indent=2))
    print(f'Total: {cursor/FPS:.2f}s', flush=True)

if __name__ == '__main__':
    asyncio.run(main())
