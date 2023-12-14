import {
  CmafDestinationSettings,
  CmafOutputSettings,
  Norsk,
  selectAudio,
  selectPlaylist,
  selectVideo,
} from "@norskvideo/norsk-sdk";

export async function main() {
  const norsk = await Norsk.connect();
  const input = await norsk.input.rtmpServer({ id: "rtmpInput" });

  const audioOutput = await norsk.output.cmafAudio({
    id: "audio",
    ...segmentSettings,
  });
  const videoOutput = await norsk.output.cmafVideo({
    id: "video",
    ...segmentSettings,
  });
  const multiVariantOutput = await norsk.output.cmafMultiVariant({
    id: "multi-variant",
    playlistName: "multi-variant",
    destinations,
  });

  audioOutput.subscribe([{ source: input, sourceSelector: selectAudio }]);
  videoOutput.subscribe([{ source: input, sourceSelector: selectVideo }]);

  multiVariantOutput.subscribe([
    { source: audioOutput, sourceSelector: selectPlaylist },
    { source: videoOutput, sourceSelector: selectPlaylist },
  ]);

  console.log(`Multi variant playlist: ${multiVariantOutput.url}`);
  audioOutput.url().then(logMediaPlaylist("audio"));
  videoOutput.url().then(logMediaPlaylist("video"));
}

const destinations: CmafDestinationSettings[] = [
  { type: "local", retentionPeriodSeconds: 10 },
];

const segmentSettings: CmafOutputSettings = {
  partDurationSeconds: 1.0,
  segmentDurationSeconds: 4.0,
  destinations,
};

function logMediaPlaylist(name: string): (url: string) => void {
  return (url) => {
    console.log(`${name} playlistUrl: ${url}`);
  };
}
