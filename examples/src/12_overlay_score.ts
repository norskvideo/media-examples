import {
  BrowserInputSettings,
  ComposePart,
  Norsk,
  VideoComposeSettings,
  clientHostExternal,
  selectVideo,
  selectAudio,
  videoToPin,
} from "@norskvideo/norsk-sdk";
import { default as express, Request, Response } from "express";
import { webRtcServerConfig } from "./common/webRtcServerConfig";

const app = express();
const port = 3000;


export async function main() {
  runWebServer();
  const norsk = await Norsk.connect();

  const input1 = await norsk.input.rtmpServer({ id: "rtmpInput" });
  const input2 = await norsk.input.browser(browserSettings);
  const compose = await norsk.processor.transform.videoCompose(composeSettings);
  const output = await norsk.output.whep({ id: "webrtc", ...webRtcServerConfig});

  compose.subscribeToPins([
    { source: input1, sourceSelector: videoToPin(background.pin) },
    { source: input2, sourceSelector: videoToPin(overlay.pin) },
  ]);

  output.subscribe([
    { source: compose, sourceSelector: selectVideo },
    { source: input1, sourceSelector: selectAudio },
  ]);

  console.log(`WebRTC Player URL: ${output.playerUrl}`);
}

const host = clientHostExternal();
const browserSettings: BrowserInputSettings = {
  id: "browser",
  url: `http://${host}:3000/static/overlay-score.html`,
  resolution: { width: 1280, height: 720 },
  sourceName: "browserOverlay",
  frameRate: { frames: 25, seconds: 1 },
};
const background: ComposePart<"background"> = {
  pin: "background",
  opacity: 1.0,
  zIndex: 0,
  sourceRect: { x: 0, y: 0, width: 100, height: 100 },
  destRect: { x: 0, y: 0, width: 100, height: 100 },
};
const overlay: ComposePart<"overlay"> = {
  pin: "overlay",
  opacity: 1.0,
  zIndex: 1,
  sourceRect: { x: 0, y: 0, width: 100, height: 100 },
  destRect: { x: 0, y: 0, width: 100, height: 100 },
};

const parts = [background, overlay];
const composeSettings: VideoComposeSettings<"background" | "overlay"> = {
  id: "compose",
  referenceStream: background.pin,
  outputResolution: { width: 1280, height: 720 },
  referenceResolution: { width: 100, height: 100 },
  outputPixelFormat: "bgra",
  parts,
};


function runWebServer() {
  const scoreboard = {
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

