import {
  CMAFDestinationSettings,
  Norsk,
  selectAudio,
  selectAV,
  selectVideo,
  SrtInputSettings,
} from "@norskvideo/norsk-sdk";

export async function main() {
  const norsk = await Norsk.connect();

  let input = await norsk.input.srt(srtInputSettings);
  let destinations: CMAFDestinationSettings[] = [{ type: "local", retentionPeriodSeconds: 10 }]

  let audioOutput = await norsk.output.cmafAudio({ id: "audio", destinations, ...segmentSettings });
  let videoOutput = await norsk.output.cmafVideo({ id: "video", destinations, ...segmentSettings });
  let masterOutput = await norsk.output.cmafMaster({ id: "master", playlistName: "master", destinations });

  let streamMetadataOverride = await norsk.processor.transform.streamMetadataOverride({
    id: "setBitrate",
    video: { bitrate: 150_000 },
    audio: { bitrate: 20_000 },
  });
  streamMetadataOverride.subscribe([
    { source: input, sourceSelector: selectAV },
  ]);

  audioOutput.subscribe([{ source: streamMetadataOverride, sourceSelector: selectAudio }]);
  videoOutput.subscribe([{ source: streamMetadataOverride, sourceSelector: selectVideo }]);
  masterOutput.subscribe([{ source: streamMetadataOverride, sourceSelector: selectAV }]);

  console.log(`Master playlist: ${masterOutput.playlistUrl}`);
  audioOutput.url().then(logMediaPlaylist("audio"));
  videoOutput.url().then(logMediaPlaylist("video"));
}

const segmentSettings = {
  partDurationSeconds: 1.0,
  segmentDurationSeconds: 4.0,
};

const srtInputSettings: SrtInputSettings = {
  id: "srtInput",
  ip: "127.0.0.1",
  port: 5001,
  mode: "listener",
  sourceName: "camera1",
};

function logMediaPlaylist(name: string): (url: string) => void {
  return (
    url => { console.log(`${name} playlistUrl: ${url}`); }
  );
}
