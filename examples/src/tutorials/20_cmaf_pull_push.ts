import { CmafDestinationSettings, Norsk, selectAudio, selectPlaylist, selectVideo } from "@norskvideo/norsk-sdk";
import { runWebServer } from '../common/webServer';

const port = 3210;

export async function main() {
  await runWebServer(port);

  const norsk = await Norsk.connect();

  const input = await norsk.input.rtmpServer({ id: "rtmpInput" });

  const destinations: CmafDestinationSettings[] = [
    { type: "local", retentionPeriodSeconds: 60, id: "local" },
    { type: "generic", id: "genericPullPush", host: "localhost", port, pathPrefix: "/push/", retentionPeriodSeconds: 60 }
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
  void audioOutput.url().then(logMediaPlaylist("audio"));
  void videoOutput.url().then(logMediaPlaylist("video"));

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

