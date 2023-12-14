import { CmafDestinationSettings, Norsk, selectAudio, selectPlaylist, selectVideo } from "@norskvideo/norsk-sdk";
const express = require("express");
const cors = require('cors');
import { Request, Response } from "express";

const app = express();
const port = 3210;

export async function main() {
  runWebServer();

  const norsk = await Norsk.connect();

  const input = await norsk.input.rtmpServer({ id: "rtmpInput" });

  const destinations: CmafDestinationSettings[] = [
    { type: "local", retentionPeriodSeconds: 10 },
    { type: "generic", id: "localPush", host: "localhost", port, pathPrefix: "/push/", retentionPeriodSeconds: 60 }
  ]

  const audioOutput = await norsk.output.cmafAudio({ id: "audio", destinations, ...segmentSettings });
  const videoOutput = await norsk.output.cmafVideo({ id: "video", destinations, ...segmentSettings });
  const masterOutput = await norsk.output.cmafMultiVariant({ id: "multi-variant", playlistName: "multi-variant", destinations });

  audioOutput.subscribe([{ source: input, sourceSelector: selectAudio }]);
  videoOutput.subscribe([{ source: input, sourceSelector: selectVideo }]);
  masterOutput.subscribe([
    { source: audioOutput, sourceSelector: selectPlaylist },
    { source: videoOutput, sourceSelector: selectPlaylist }
  ]);

  console.log(`Master playlist: ${masterOutput.url}`);
  audioOutput.url().then(logMediaPlaylist("audio"));
  videoOutput.url().then(logMediaPlaylist("video"));

}

// A small webserver to act as a local CDN for the Push destination
async function runWebServer() {
  const database: Record<string, Buffer> = {};
  app.use(cors());
  app.use(express.raw({ type: ['application/vnd.apple.mpegurl', 'video/mp4', 'application/dash+xml'], limit: "15mb" }));

  app.post("*.*",
    (req: Request, res: Response) => {
      console.log(`{RECEIVED FILE ${req.url} size: ${req.body.length}`);
      if (req.body.length) {
        database[req.url] = req.body as Buffer;
      }
      res.sendStatus(204);
    });
  app.get("*.m3u8", (req: Request, res: Response) => {
    res.setHeader('Content-Type', 'application/vnd.apple.mpegurl');
    if (req.url in database) {
      res.send(database[req.url]);
    } else {
      res.sendStatus(404);
    }
  });
  app.get("*.mpd", (req: Request, res: Response) => {
    res.setHeader('Content-Type', 'application/dash+xml');
    if (req.url in database) {
      res.send(database[req.url]);
    } else {
      res.sendStatus(404);
    }
  });
  app.get("*.mp4", (req: Request, res: Response) => {
    res.setHeader('Content-Type', 'video/mp4');
    if (req.url in database) {
      res.send(database[req.url]);
    } else {
      console.log("NOT FOUND", req.url);
      res.sendStatus(404);
    }
  });
  app.listen(port, () => {
    console.log(`app listening on http://localhost:${port}/`);
  });
}

const segmentSettings = {
  partDurationSeconds: 1.0,
  segmentDurationSeconds: 4.0,
};

function logMediaPlaylist(name: string): (url: string) => void {
  return (
    url => { console.log(`${name} playlistUrl: ${url}`); }
  );
}

