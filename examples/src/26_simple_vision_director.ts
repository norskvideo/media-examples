import {
  Norsk,
  SrtInputSettings,
  selectAudio,
  selectAV,
  selectVideo,
  StreamSwitchSmoothSettings,
  videoToPin,
  audioToPin,
  avToPin,
  ComposePart,
  VideoComposeSettings,
  StreamKeyOverrideSettings,
  SourceMediaNode,
  StreamKey,
  clientHostExternal,
  debugUrlPrefix,
  StreamSwitchSmoothNode,
  VideoComposeDefaults,
} from "@norskvideo/norsk-sdk";
import { Request, Response } from "express";
import express = require("express");

import { webRtcServerConfig } from "./common/webRtcServerConfig";

const sourceNames = ["camera1", "camera2", "pip12", "pip21"] as const;
type SourceName = (typeof sourceNames)[number];

const initialActiveSource: SourceName = "camera1";
const streamSwitchSmoothSettings: StreamSwitchSmoothSettings<SourceName> = {
  id: "switcher",
  activeSource: initialActiveSource,
  outputSource: "output",
  outputResolution: { width: 1280, height: 720 },
  transitionDurationMs: 500.0,
  sampleRate: 48000,
  frameRate: { frames: 25, seconds: 1 },
  channelLayout: "stereo",
};

async function mkPreview(norsk: Norsk, source: SourceMediaNode, id: string) {
  const preview = await norsk.output.whep({ id, ...webRtcServerConfig });
  preview.subscribe([{ source, sourceSelector: selectAV }]);
  console.log(`Preview: ${preview.playerUrl}`);
  return preview;
}

async function mkCompose(
  norsk: Norsk,
  backgroundSrc: SourceMediaNode,
  embeddedSrc: SourceMediaNode,
  sourceName: string
) {
  const composer = await norsk.processor.transform.videoCompose(
    composeSettings(sourceName)
  );
  composer.subscribeToPins([
    { source: backgroundSrc, sourceSelector: videoToPin(background.pin) },
    { source: embeddedSrc, sourceSelector: videoToPin(embedded.pin) },
  ]);

  const streamKeySettings = pipStreamKeyConfig(sourceName);

  const audioNormalizer = await norsk.processor.transform.streamKeyOverride(
    streamKeySettings.audio
  );
  audioNormalizer.subscribe([
    { source: backgroundSrc, sourceSelector: selectAudio },
  ]); // TODO merge pip audios
  const videoNormalizer = await norsk.processor.transform.streamKeyOverride(
    streamKeySettings.video
  );
  videoNormalizer.subscribe([
    { source: composer, sourceSelector: selectVideo },
  ]);
  return { audio: audioNormalizer, video: videoNormalizer, composer };
}
export async function main() {
  const norsk = await Norsk.connect();

  const sos1 = await norsk.input.srt(srtInputSettings);
  const sos2 = await norsk.input.srt(srtInputSettings2);

  const camera1Preview = await mkPreview(norsk, sos1, "camera1Preview");
  const camera2Preview = await mkPreview(norsk, sos2, "camera2Preview");

  const c12 = await mkCompose(norsk, sos1, sos2, "pip12");
  const c21 = await mkCompose(norsk, sos2, sos1, "pip21");

  const pip12Preview = await norsk.output.whep({
    id: "pip12Preview",
    ...webRtcServerConfig,
  });
  const pip21Preview = await norsk.output.whep({
    id: "pip21Preview",
    ...webRtcServerConfig,
  });
  pip12Preview.subscribe([
    { source: c12.video, sourceSelector: selectVideo },
    { source: c12.audio, sourceSelector: selectAudio },
  ]);
  pip21Preview.subscribe([
    { source: c21.video, sourceSelector: selectVideo },
    { source: c21.audio, sourceSelector: selectAudio },
  ]);

  console.log(`Pip12 preview: ${pip12Preview.playerUrl}`);
  console.log(`Pip21 preview: ${pip21Preview.playerUrl}`);

  const streamSwitchSmooth: StreamSwitchSmoothNode<SourceName> =
    await norsk.processor.control.streamSwitchSmooth(
      streamSwitchSmoothSettings
    );

  streamSwitchSmooth.subscribeToPins([
    { source: sos1, sourceSelector: avToPin("camera1") },
    { source: sos2, sourceSelector: avToPin("camera2") },
    { source: c12.video, sourceSelector: videoToPin("pip12") },
    { source: c12.audio, sourceSelector: audioToPin("pip12") },
    { source: c21.video, sourceSelector: videoToPin("pip21") },
    { source: c21.audio, sourceSelector: audioToPin("pip21") },
  ]);

  const _livePreview = await mkPreview(
    norsk,
    streamSwitchSmooth,
    "livePreview"
  );

  let currentActiveSource: string = initialActiveSource;

  const app = express();
  app.set("view engine", "ejs");
  const port = 3000;
  const host = clientHostExternal();
  const visualiserUrl = debugUrlPrefix() + "/visualiser";
  app.use(express.json());
  app.put("/switch/:source", (req: Request, res: Response) => {
    const idx = sourceNames.indexOf(req.params.source as SourceName);
    if (idx !== -1) {
      streamSwitchSmooth.switchSource(sourceNames[idx] as SourceName);
      currentActiveSource = sourceNames[idx];
      res.send("");
    } else {
      res.sendStatus(404);
    }
  });
  app.get("/", (_req: Request, res: Response) => {
    const scenes = [
      {
        sourceName: "camera1",
        title: "Camera 1",
        url: camera1Preview.endpointUrl,
      },
      {
        sourceName: "camera2",
        title: "Camera 2",
        url: camera2Preview.endpointUrl,
      },
      {
        sourceName: "pip12",
        title: "PiP 1/2",
        url: pip12Preview.endpointUrl,
      },
      {
        sourceName: "pip21",
        title: "PiP 2/1",
        url: pip21Preview.endpointUrl,
      },
    ];
    const title = (sourceName: string) => {
      for (const scene of scenes) {
        if (scene.sourceName == sourceName) {
          return scene.title;
        }
      }
      return "unknown";
    };
    const vars = {
      visualiserUrl,
      livePreviewUrl: _livePreview.endpointUrl,
      initialActiveSource: currentActiveSource,
      activeSourceTitle: title(currentActiveSource),
      scenes,
    };

    res.render("99_view", vars);
  });
  app.use("/static", express.static("static"));
  app.listen(port, () => {
    console.log(`Hosted app listening on http://${host}:${port}/`);
  });
}

const bottomRight = { x: 50, y: 50, width: 45, height: 45 };

const background: ComposePart<"background"> = {
  pin: "background",
  opacity: 1.0,
  zIndex: 0,
  compose: VideoComposeDefaults.fullscreen()
};
const embedded: ComposePart<"embedded"> = {
  pin: "embedded",
  opacity: 1.0,
  zIndex: 1,
  compose: VideoComposeDefaults.percentage({
    sourceRect: { x: 0, y: 0, width: 100, height: 100 },
    destRect: bottomRight,
  })
};

function composeSettings(
  id: string
): VideoComposeSettings<"background" | "embedded"> {
  return {
    id,
    referenceStream: background.pin,
    outputResolution: { width: 1280, height: 720 },
    parts,
    outputPixelFormat: "yuv420p",
    onError: () => process.exit(), // interval keeps this script alive after nodes close
  };
}

/**
 * The source switcher selects sources based on sourceName, so we override the outputs from the audio merge and pip to
 * have a known sourceName.
 * @param name the source name to set
 * @returns Video and audio stream key override settings with the supplied sourceName
 */
function pipStreamKeyConfig(name: string): {
  video: StreamKeyOverrideSettings;
  audio: StreamKeyOverrideSettings;
} {
  const mkStreamKey = (renditionName: string, streamId: number): StreamKey => {
    return {
      programNumber: 1,
      renditionName,
      streamId,
      sourceName: name,
    };
  };
  return {
    video: {
      id: "sk_override_video_" + name,
      streamKey: mkStreamKey("video", 256),
    },
    audio: {
      id: "sk_override_audio" + name,
      streamKey: mkStreamKey("audio", 257),
    },
  };
}

const parts = [background, embedded];

const srtInputSettings2: SrtInputSettings = {
  id: "srtInput2",
  host: "0.0.0.0",
  port: 5002,
  mode: "listener",
  sourceName: "camera2",
  onConnection: (streamId) => {
    if (streamId == "camera2") {
      return { accept: true, sourceName: "camera2" };
    }
    return { accept: false };
  },
};

const srtInputSettings: SrtInputSettings = {
  id: "srtInput1",
  host: "0.0.0.0",
  port: 5001,
  mode: "listener",
  sourceName: "camera1",
  onConnection: (streamId) => {
    if (streamId == "camera1") {
      return { accept: true, sourceName: "camera1" };
    }
    return { accept: false };
  },
};

