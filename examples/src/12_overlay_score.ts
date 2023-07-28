import {
  BrowserInputSettings,
  ComposePart,
  Norsk,
  VideoComposeSettings,
  VideoEncodeRung,
  clientHostExternal,
  clientHostInternal,
  selectVideo,
  selectAudio,
  videoToPin,
} from "@norskvideo/norsk-sdk";
import { Request, Response } from "express";

const express = require("express");
const app = express();
const port = 3000;

export async function main() {
  runWebServer();

  const norsk = await Norsk.connect();

  let input = await norsk.input.rtmpServer({ id: "rtmpInput" });

  const host = clientHostInternal();
  const browserSettings: BrowserInputSettings = {
    id: "browser",
    url: `http://${host}:3000/static/overlay-score.html`,
    resolution: { width: 1280, height: 720 },
    sourceName: "browserOverlay",
    frameRate: { frames: 25, seconds: 1 },
  };
  let browserInput = await norsk.input.browser(browserSettings);

  const backgroundPart: ComposePart<"background"> = {
    pin: "background",
    opacity: 1.0,
    zIndex: 0,
    sourceRect: { x: 0, y: 0, width: 100, height: 100 },
    destRect: { x: 0, y: 0, width: 100, height: 100 },
  };
  const overlayPart: ComposePart<"overlay"> = {
    pin: "overlay",
    opacity: 1.0,
    zIndex: 1,
    sourceRect: { x: 0, y: 0, width: 100, height: 100 },
    destRect: { x: 0, y: 0, width: 100, height: 100 },
  };

  const parts = [backgroundPart, overlayPart];

  const composeSettings: VideoComposeSettings<"background" | "overlay"> = {
    id: "compose",
    referenceStream: backgroundPart.pin,
    outputResolution: { width: 1280, height: 720 },
    referenceResolution: { width: 100, height: 100 },
    outputPixelFormat: "bgra",
    parts,
  };
  let overlay = await norsk.processor.transform.videoCompose(composeSettings);

  overlay.subscribeToPins([
    {
      source: input,
      sourceSelector: videoToPin("background"),
    },
    {
      source: browserInput,
      sourceSelector: videoToPin("overlay"),
    },
  ]);

  let encode = await norsk.processor.transform.videoEncode({
    id: "ladder1",
    rungs: [mkRung("high", 854, 480, 800000)],
  });
  encode.subscribe([{ source: overlay, sourceSelector: selectVideo }]);

  let output = await norsk.output.whep({ id: "webrtc" });

  output.subscribe([
    { source: encode, sourceSelector: selectVideo },
    { source: input, sourceSelector: selectAudio },
  ]);

  console.log(`Local player: ${output.playerUrl}`);
}

function runWebServer() {
  let scoreboard = {
    team1: { name: "Team1", score: 0 },
    team2: { name: "Team2", score: 0 },
  };
  app.use(express.json());
  app.use("/static", express.static("static"));
  app.get("/score", (req: Request, res: Response) => {
    res.send(scoreboard);
  });
  app.post("/score", (req: Request, res: Response) => {
    scoreboard.team1.score = req.body["team1-score"];
    scoreboard.team2.score = req.body["team2-score"];
    scoreboard.team1.name = req.body["team1-name"];
    scoreboard.team2.name = req.body["team2-name"];
    res.send("");
  });
  app.listen(port, () => {
    const host = clientHostExternal();
    console.log(`overlay_score running on port ${port}.
You'll find the score overlay in http://${host}:${port}/static/overlay-score.html
and the UI for updating the score in http://${host}:${port}/static/overlay-ui.html`);
  });
}

function mkRung(
  name: string,
  width: number,
  height: number,
  bitrate: number
): VideoEncodeRung {
  return {
    name,
    width,
    height,
    frameRate: { frames: 25, seconds: 1 },
    codec: {
      type: "x264",
      bitrateMode: { value: bitrate, mode: "abr" },
      keyFrameIntervalMax: 50,
      keyFrameIntervalMin: 50,
      sceneCut: 0,
      bframes: 0,
      tune: "zerolatency",
    },
  };
}

