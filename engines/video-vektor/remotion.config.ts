import {existsSync} from 'node:fs';
import {Config} from '@remotion/cli/config';

Config.setVideoImageFormat('jpeg');
Config.setOverwriteOutput(true);
Config.setCodec('h264');
Config.setCrf(18);
// ncpost runs on a 2-core, GPU-less server; keep the film itself unchanged.
Config.setConcurrency(1);
Config.setDisallowParallelEncoding(true);
Config.setOffthreadVideoCacheSizeInBytes(64 * 1024 * 1024);
// Hermes' WhatsApp bridge cleans up listeners on port 3000 during reconnects.
// Keep Remotion on its own port, separate from the UI on 8077.
Config.setStudioPort(8078);
Config.setRendererPort(8078);
Config.setChromiumOpenGlRenderer('swangle');
// Keep the original browser when installed; otherwise use Remotion's managed Chrome.
Config.setBrowserExecutable(existsSync('/usr/bin/google-chrome')?'/usr/bin/google-chrome':null);
