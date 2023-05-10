import {
  CMAFDestinationSettings,
  Norsk,
  selectAudio,
  selectAV,
  selectVideo,
} from "@norskvideo/norsk-sdk";

export async function main() {
  const norsk = await Norsk.connect();

  let input = await norsk.input.rtmpServer({ id: "rtmpInput", port: 5001 });
  let destinations: CMAFDestinationSettings[] = [{ type: "local", retentionPeriodSeconds: 10 }]

  let audioOutput = await norsk.output.hlsAudio({ id: "audio", destinations, ...segmentSettings });
  let videoOutput = await norsk.output.hlsVideo({ id: "video", destinations, ...segmentSettings });
  let masterOutput = await norsk.output.hlsMaster({ id: "master", playlistName: "master", destinations });

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
