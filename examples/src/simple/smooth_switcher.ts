import {
  Norsk,
  SmoothSwitcherSettings,
  SrtInputSettings,
  VideoEncodeLadderRung,
  avToPin,
  selectAudio,
  selectVideo
} from "@id3asnorsk/norsk-sdk";
import { Request, Response } from "express";
const express = require("express");


export async function main() {
  let ladderRungs: VideoEncodeLadderRung[] = [
    {
      name: "high",
      width: 1280,
      height: 720,
      frameRate: { frames: 25, seconds: 1 },
      codec: {
        type: "x264",
        tune: "zerolatency",
        preset: "ultrafast",
        profile: "high",
        bitrateMode: { value: 600000, mode: "abr" },
      },
    },
  ];
  let srtCamera1: SrtInputSettings = {
    id: "camera1",
    ip: "127.0.0.1",
    port: 5001,
    mode: "listener",
    sourceName: "camera1",
  };
  let srtCamera2: SrtInputSettings = {
    id: "camera2",
    ip: "127.0.0.1",
    port: 5002,
    mode: "listener",
    sourceName: "camera2",
  };
  let smoothSwitcherSettings: SmoothSwitcherSettings<"camera1" | "camera2"> = {
    id: "switcher",
    activeSource: "camera1",
    outputSource: "output",
    outputResolution: { width: 1280, height: 720 },
    transitionDurationMs: 500.0,
    sampleRate: 48000,
  };
  let rtcOutputSettings = {
    id: "static",
  };

  const norsk = await Norsk.connect({
    onShutdown: () => {
      console.log("Norsk has shutdown");
      process.exit(1)
    }
  });
  let camera1 = await norsk.input.srt(srtCamera1);
  let camera2 = await norsk.input.srt(srtCamera2);
  let smoothSwitcher = await norsk.processor.control.smoothSwitcher(smoothSwitcherSettings);
  let output = await norsk.duplex.localWebRTC(rtcOutputSettings);

  smoothSwitcher.subscribeToPins([
    { source: camera1, sourceSelector: avToPin("camera1") },
    { source: camera2, sourceSelector: avToPin("camera2") },
  ]);

  let ladder = await norsk.processor.transform.videoEncodeLadder({
    id: "ladder",
    rungs: ladderRungs,
  });
  ladder.subscribe([{ source: smoothSwitcher, sourceSelector: selectVideo }]);

  output.subscribe([
    { source: ladder, sourceSelector: selectVideo },
    { source: smoothSwitcher, sourceSelector: selectAudio },
  ]);

  // console.log(`Local player: ${output.playerUrl}`);

  const app = express();
  const port = 6792;
  app.use(express.json());
  app.put("/switch/:source", (req: Request, res: Response) => {
    if (req.params.source == "camera1" || req.params.source == "camera2") {
      smoothSwitcher.switchSource(req.params.source);
      res.send("");
    } else {
      res.sendStatus(404);
    }
  });
  app.get("/", (req: Request, res: Response) => {
    res.send(`
  <script>
    function swap(source) {
      fetch("http://localhost:6792/switch/" + source, { method: "PUT" })
    }
  </script>
  <p>
    <button onclick="swap('camera1'); return false" style="font-size: 35">Camera 1</button>
    <button onclick="swap('camera2'); return false" style="font-size: 35">Camera 2</button>
  </p>
  <iframe width=1280 height=720 frameBorder="0" src="${output.playerUrl}"></iframe>
  `);
  });

  app.listen(port, () => {
    console.log(
      `Hosted smooth_switcher app listening on http://localhost:${port}/`
    );
  });
}

