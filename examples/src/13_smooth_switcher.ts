import {
  Norsk,
  SrtInputSettings,
  StreamSwitchSmoothSettings,
  VideoEncodeRung,
  avToPin,
  clientHostExternal,
  selectAudio,
  selectVideo,
} from "@norskvideo/norsk-sdk";
import { Request, Response } from "express";

const express = require("express");

export async function main() {
  let ladderRungs: VideoEncodeRung[] = [
    {
      name: "high",
      width: 1280,
      height: 720,
      frameRate: { frames: 25, seconds: 1 },
      codec: {
        type: "x264",
        tune: "zerolatency",
        preset: "fast",
        profile: "high",
        bitrateMode: { value: 2000000, mode: "abr" },
      },
    },
  ];
  let srtCamera1: SrtInputSettings = {
    id: "camera1",
    ip: "0.0.0.0",
    port: 5001,
    mode: "listener",
    sourceName: "camera1",
  };
  let srtCamera2: SrtInputSettings = {
    id: "camera2",
    ip: "0.0.0.0",
    port: 5002,
    mode: "listener",
    sourceName: "camera2",
  };
  let streamSwitchSmoothSettings: StreamSwitchSmoothSettings<"camera1" | "camera2"> = {
    id: "switcher",
    activeSource: "camera1",
    outputSource: "output",
    outputResolution: { width: 1280, height: 720 },
    transitionDurationMs: 500.0,
    sampleRate: 48000,
  };

  const norsk = await Norsk.connect();
  let camera1 = await norsk.input.srt(srtCamera1);
  let camera2 = await norsk.input.srt(srtCamera2);
  let streamSwitchSmooth = await norsk.processor.control.streamSwitchSmooth(streamSwitchSmoothSettings);
  let output = await norsk.output.whep({ id: "webrtc" });

  streamSwitchSmooth.subscribeToPins([
    { source: camera1, sourceSelector: avToPin("camera1") },
    { source: camera2, sourceSelector: avToPin("camera2") },
  ]);

  let ladder = await norsk.processor.transform.videoEncode({
    id: "ladder",
    rungs: ladderRungs,
  });
  ladder.subscribe([{ source: streamSwitchSmooth, sourceSelector: selectVideo }]);

  output.subscribe([
    { source: ladder, sourceSelector: selectVideo },
    { source: streamSwitchSmooth, sourceSelector: selectAudio },
  ]);

  const app = express();
  const port = 3000;
  const host = clientHostExternal();
  app.use(express.json());
  app.put("/switch/:source", (req: Request, res: Response) => {
    if (req.params.source == "camera1" || req.params.source == "camera2") {
      streamSwitchSmooth.switchSource(req.params.source);
      res.send("");
    } else {
      res.sendStatus(404);
    }
  });
  app.get("/", (req: Request, res: Response) => {
    res.send(`
  <link rel="stylesheet" href="/static/doodle.css" type="text/css">
  <link rel="stylesheet" href="/static/font.css" type="text/css">
  <script>
    function swap(source) {
      fetch("/switch/" + source, { method: "PUT" })
    }
  </script>
  <body class="doodle">
    <p>
      <button onclick="swap('camera1'); return false" style="font-size: 35">Camera 1</button>
      <button onclick="swap('camera2'); return false" style="font-size: 35">Camera 2</button>
    </p>
    <iframe width=1280 height=720 frameBorder="0" src="${output.playerUrl}"></iframe>
  </body>
  `);
  });
  app.use("/static", express.static("static"));
  app.listen(port, () => {
    console.log(
      `Hosted smooth_switcher app listening on http://${host}:${port}/`
    );
    console.log(`Local player: ${output.playerUrl}`);
  });
}

