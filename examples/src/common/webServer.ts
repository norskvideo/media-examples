const express = require("express");
const cors = require('cors');
import { Request, Response } from "express";

type Options = {
  logPlaylists: boolean;
}

// A small webserver to act as a local CDN for the Push destination
export async function runWebServer(port: number, opts?: Options) {
  const app = express();
  const database: Record<string, Buffer> = {};
  app.use(cors());
  app.use(express.raw({ type: ['application/vnd.apple.mpegurl', 'video/mp4', 'application/dash+xml'], limit: "15mb" }));

  app.post("*.*",
    (req: Request, res: Response) => {
      console.log(`{RECEIVED FILE ${req.url} size: ${req.body.length}`);
      if (req.body.length) {
        database[req.url] = req.body as Buffer;
      }
      const hlsPlaylistRegex = /.m3u8$/
      if (opts?.logPlaylists && hlsPlaylistRegex.test(req.url)) {
        console.log(`RECEIVED PLAYLIST: ${req.body.toString()}`)
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
