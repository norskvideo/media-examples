import {
  CmafDestinationSettings,
  Norsk,
  SrtInputSettings,
  selectAudio,
  selectVideo,
  selectPlaylist,
  CmafOutputSettings,
} from "@norskvideo/norsk-sdk";

export async function main() {
  const norsk = await Norsk.connect();

  const input = await norsk.input.srt(srtInputSettings);

  // Receive an inbound stream and segment it as CMAF chunks for publication as LL-HLS (or DASH)
  // Note that as it is passthrough we don't necessarily know the bitrate of the stream
  // for the HLS multi variant (master) playlist.  Here we set them by hand with streamMetadataOverride but
  // other examples show how you can measure bitrates and use that in the multi variant playlist.
  // If a transcode is happening (take a look at the various _to_ladder examples) then
  // we streams will have well known bitrates that automatically flow through the workflow
  // Note that from here on down, the code is identical to the code in srt_to_hls_passthrough
  // With Norsk you only need to describe the desired media flow - it takes care of the differences
  // between various input types.

  const audioOutput = await norsk.output.cmafAudio({ id: "audio", ...segmentSettings });
  const videoOutput = await norsk.output.cmafVideo({ id: "video", ...segmentSettings });
  const multiVariantOutput = await norsk.output.cmafMultiVariant({ id: "multi-variant", playlistName: "multi-variant", destinations });

  const streamMetadataOverride = await norsk.processor.transform.streamMetadataOverride({
    id: "setBitrate",
    video: { bitrate: 500_000 },
    audio: { bitrate: 20_000 },
  });

  streamMetadataOverride.subscribe([
    { source: audioOutput, sourceSelector: selectPlaylist },
    { source: videoOutput, sourceSelector: selectPlaylist },
  ]);

  multiVariantOutput.subscribe([
    { source: streamMetadataOverride, sourceSelector: selectPlaylist }
  ]);

  audioOutput.subscribe([{ source: input, sourceSelector: selectAudio }]);
  videoOutput.subscribe([{ source: input, sourceSelector: selectVideo }]);

  console.log(`Multi variant playlist: ${multiVariantOutput.playlistUrl}`);
  audioOutput.url().then(logMediaPlaylist("audio"));
  videoOutput.url().then(logMediaPlaylist("video"));
}

const destinations: CmafDestinationSettings[] =
  [{ type: "local", retentionPeriodSeconds: 10 }]

const segmentSettings: CmafOutputSettings = {
  partDurationSeconds: 1.0,
  segmentDurationSeconds: 4.0,
  destinations
};

const srtInputSettings: SrtInputSettings = {
  id: "srtInput",
  ip: "0.0.0.0",
  port: 5001,
  mode: "listener",
  sourceName: "camera1",
};

function logMediaPlaylist(name: string): (url: string) => void {
  return (
    url => { console.log(`${name} playlistUrl: ${url}`); }
  );
}
