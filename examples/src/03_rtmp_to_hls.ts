import {
  CmafDestinationSettings,
  Norsk,
  selectAudio,
  selectAV,
  selectVideo,
} from "@norskvideo/norsk-sdk";

export async function main() {
  const norsk = await Norsk.connect();

  const input = await norsk.input.rtmpServer({ id: "rtmpInput" });
  const destinations: CmafDestinationSettings[] = [{ type: "local", retentionPeriodSeconds: 10 }]

  const audioOutput = await norsk.output.cmafAudio({ id: "audio", destinations, ...segmentSettings });
  const videoOutput = await norsk.output.cmafVideo({ id: "video", destinations, ...segmentSettings });
  const masterOutput = await norsk.output.cmafMaster({ id: "master", playlistName: "master", destinations });

  audioOutput.subscribe([{ source: input, sourceSelector: selectAudio }]);
  videoOutput.subscribe([{ source: input, sourceSelector: selectVideo }]);
  masterOutput.subscribe([{ source: input, sourceSelector: selectAV }]);

  console.log(`Master playlist: ${masterOutput.playlistUrl}`);
  audioOutput.url().then(logMediaPlaylist("audio"));
  videoOutput.url().then(logMediaPlaylist("video"));
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
