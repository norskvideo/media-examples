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

  // Receive an inbound stream and segment it as CMAF chunks for publication as HLS and DASH
  // Note that as this is passthrough we don't necessarily know the bitrate of the stream
  // for the HLS multi variant (master) playlist.  Here we just set them by hand in the CMAF Audio and CMAF
  // video segmenters.  Other examples show how you can measure bitrates and use that in the multi variant playlist.
  // If a transcode is happening (take a look at the various _to_ladder examples) then
  // each streams will have well known bitrates that automatically flow through the workflow
  // Note that from here on down, the code is identical to the code in rtmp_to_hls_passthrough
  // With Norsk you only need to describe the desired media flow - it takes care of the differences
  // between various input types.

  const audioOutput = await norsk.output.cmafAudio({ id: "audio", bitrate: 20_000, ...segmentSettings });
  const videoOutput = await norsk.output.cmafVideo({ id: "video", bitrate: 1_500_000, ...segmentSettings });
  const mvOutput = await norsk.output.cmafMultiVariant({ id: "multi-variant", playlistName: "multi-variant", destinations });

  mvOutput.subscribe([
    { source: audioOutput, sourceSelector: selectPlaylist },
    { source: videoOutput, sourceSelector: selectPlaylist },
  ]);

  audioOutput.subscribe([{ source: input, sourceSelector: selectAudio }]);
  videoOutput.subscribe([{ source: input, sourceSelector: selectVideo }]);

  console.log(`Multi variant playlist: ${mvOutput.url}`);
  audioOutput.url().then(logMediaPlaylist("audio"));
  videoOutput.url().then(logMediaPlaylist("video"));
}

const destinations: CmafDestinationSettings[] =
  [{ id: "local", type: "local", retentionPeriodSeconds: 10 }];

const segmentSettings: CmafOutputSettings = {
  partDurationSeconds: 1.0,
  segmentDurationSeconds: 4.0,
  destinations
};

function logMediaPlaylist(name: string): (url: string) => void {
  return (
    url => { console.log(`${name} playlistUrl: ${url}`); }
  );
}
