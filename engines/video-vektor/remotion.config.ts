import {Config} from '@remotion/cli/config';

Config.setVideoImageFormat('jpeg');
Config.setOverwriteOutput(true);
Config.setCodec('h264');
Config.setCrf(18);
Config.setConcurrency(2);
// Hermes' WhatsApp bridge cleans up listeners on port 3000 during reconnects.
// Keep Remotion on its own port, separate from the UI on 8077.
Config.setStudioPort(8078);
Config.setRendererPort(8078);
Config.setChromiumOpenGlRenderer('angle');
Config.setBrowserExecutable('/usr/bin/google-chrome');
