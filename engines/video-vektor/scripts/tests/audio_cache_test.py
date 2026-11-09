"""Cache invalidation and failed TTS writes must preserve approved assets."""
import asyncio
import contextlib
import importlib.util
import io
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import types
import unittest
from unittest.mock import AsyncMock, patch

PROJECT = Path(__file__).resolve().parents[2]


class AudioCacheTest(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix='video-audio-test-')
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        for folder in ['styles/vektor-kucing/contoh', 'public/audio', 'stage', 'work']:
            (self.root/folder).mkdir(parents=True)
        self.source = json.loads((PROJECT/'naskah.json').read_text())[:2]
        (self.root/'naskah.json').write_text(json.dumps(self.source))
        (self.root/'styles/vektor-kucing/contoh/timeline.json').write_text(json.dumps({'scenes': self.source}))
        for i in range(1, 3):
            # Build offline fixtures so a fresh clone needs no generated audio cache.
            words = [{'text': text, 'start': .1 + k * .08, 'end': .16 + k * .08}
                     for k, text in enumerate(self.source[i-1]['audio_text'].split())]
            duration = words[-1]['end'] + .4
            subprocess.run(['ffmpeg', '-hide_banner', '-loglevel', 'error', '-y',
                            '-f', 'lavfi', '-i', f'sine=frequency={440+i*80}:sample_rate=24000:duration={duration}',
                            '-c:a', 'libmp3lame', str(self.root/f'public/audio/scene-{i}.mp3')], check=True)
            (self.root/f'public/audio/scene-{i}.json').write_text(json.dumps(words))
        spec = importlib.util.spec_from_file_location('audio_preparer', PROJECT/'scripts/prepare_audio.py')
        self.module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(self.module)
        self.module.ROOT = self.root

    def prepare(self, fake=None):
        env = {'TMPDIR': str(self.root/'work'), 'PIPELINE_STAGE': str(self.root/'stage')}
        with patch.dict(os.environ, env), contextlib.redirect_stdout(io.StringIO()):
            if fake is None:
                asyncio.run(self.module.main())
            else:
                with patch.dict(sys.modules, {'edge_tts': types.SimpleNamespace(Communicate=fake)}), patch.object(self.module.asyncio, 'sleep', new=AsyncMock()):
                    asyncio.run(self.module.main())

    def change_first_paragraph(self):
        self.source[0]['audio_text'] += ' Kalimat baru.'
        (self.root/'naskah.json').write_text(json.dumps(self.source))

    def test_adopts_approved_audio_and_regenerates_only_changed_text(self):
        original = [(self.root/f'public/audio/scene-{i}.mp3').read_bytes() for i in [1, 2]]
        self.prepare()
        self.assertEqual(original, [(self.root/f'public/audio/scene-{i}.mp3').read_bytes() for i in [1, 2]])
        self.change_first_paragraph()
        calls = []
        timing = json.loads((self.root/'public/audio/scene-1.json').read_text())

        class FakeVoice:
            def __init__(self, text, *args, **kwargs):
                calls.append(text)

            async def stream(self):
                yield {'type': 'audio', 'data': original[0]}
                for word in timing:
                    yield {'type': 'WordBoundary', 'text': word['text'], 'offset': round(word['start']*1e7), 'duration': round((word['end']-word['start'])*1e7)}

        self.prepare(FakeVoice)
        self.assertEqual(calls, [self.source[0]['audio_text']])
        self.prepare(FakeVoice)
        self.assertEqual(len(calls), 1, 'Unchanged cached audio must not call TTS again')
        self.assertFalse(any((self.root/'work').iterdir()))

    def test_failed_tts_keeps_audio_timing_and_metadata_and_cleans_partial_files(self):
        self.prepare()
        files = list((self.root/'public/audio').iterdir())
        before = {file.name: file.read_bytes() for file in files}
        self.change_first_paragraph()

        class FailedVoice:
            def __init__(self, *args, **kwargs):
                pass

            async def stream(self):
                yield {'type': 'audio', 'data': b'incomplete audio'}
                raise RuntimeError('simulated network failure')

        with self.assertRaisesRegex(RuntimeError, 'network failure'):
            self.prepare(FailedVoice)
        for file in files:
            self.assertEqual(file.read_bytes(), before[file.name])
        self.assertFalse(any((self.root/'work').iterdir()))


if __name__ == '__main__':
    unittest.main()
