import {
  CmafDestinationSettings,
  Norsk,
  RtmpServerInputNode,
  SrtInputNode,
  StreamMetadata,
  VideoEncodeRung,
  selectAudio,
  selectPlaylist,
  selectVideo,
  videoStreamKeys,
} from "@norskvideo/norsk-sdk";
import { webRtcServerConfig } from "./common/webRtcServerConfig";

export async function main(): Promise<void> {
  const norsk = await Norsk.connect();
  const rtmpInput = { id: "rtmp" };
  const input = await norsk.input.rtmpServer(rtmpInput);

  // We call input_to_ladder() rather than have the code inline, simply to highlight the common code between this
  // and srt_to_ladder.  Just the input changes - nothing else.
  input_to_ladder(norsk, input);
}

export async function input_to_ladder(norsk: Norsk, input: RtmpServerInputNode | SrtInputNode): Promise<void> {
  const abrLadder = await norsk.processor.transform.videoEncode({ id: "ladder", rungs: ladderRungs });
  const destinations: CmafDestinationSettings[] = [{ type: "local", retentionPeriodSeconds: 60 }]
  const multiVariantOutput = await norsk.output.cmafMultiVariant({ id: "multi-variant", playlistName: "multi-variant", destinations });
  const audioOutput = await norsk.output.cmafAudio({ id: "audio", destinations, ...segmentSettings });
  const highOutput = await norsk.output.cmafVideo({ id: "high", destinations, ...segmentSettings });
  const mediumOutput = await norsk.output.cmafVideo({ id: "medium", destinations, ...segmentSettings });
  const lowOutput = await norsk.output.cmafVideo({ id: "low", destinations, ...segmentSettings });

  const streamMetadataOverride = await norsk.processor.transform.streamMetadataOverride({
    id: "setBitrate",
    audio: { bitrate: 20_000 },
  });

  highOutput.subscribe([{ source: abrLadder, sourceSelector: ladderItem("high") }]);
  mediumOutput.subscribe([{ source: abrLadder, sourceSelector: ladderItem("medium") }]);
  lowOutput.subscribe([{ source: abrLadder, sourceSelector: ladderItem("low") }]);
  audioOutput.subscribe([{ source: streamMetadataOverride, sourceSelector: selectAudio }]);

  multiVariantOutput.subscribe([
    { source: highOutput, sourceSelector: selectPlaylist },
    { source: mediumOutput, sourceSelector: selectPlaylist },
    { source: lowOutput, sourceSelector: selectPlaylist },
    { source: audioOutput, sourceSelector: selectPlaylist },
  ]);

  const localRtcOutput = await norsk.output.whep({ id: "webrtc", ...webRtcServerConfig });
  localRtcOutput.subscribe([
    {
      source: abrLadder, sourceSelector: (streams: readonly StreamMetadata[]) => {
        const video = videoStreamKeys(streams);
        return video.filter((key) => key.renditionName === "high")
      }
    },
    { source: input, sourceSelector: selectAudio },
  ]);

  console.log(`WebRTC Player URL: ${localRtcOutput.playerUrl}`);

  abrLadder.subscribe([{ source: input, sourceSelector: selectVideo }]);
  streamMetadataOverride.subscribe([{ source: input, sourceSelector: selectAudio }])
  console.log(`HLS Multi Variant Playlist: ${multiVariantOutput.url}`);
}

const segmentSettings = {
  partDurationSeconds: 1.0,
  segmentDurationSeconds: 4.0,
}
const ladderRungs: VideoEncodeRung[] = [
  {
    name: "high",
    width: 1280,
    height: 720,
    frameRate: { frames: 25, seconds: 1 },
    codec: {
      type: "x264",
      bitrateMode: { value: 1_000_000, mode: "abr" },
      keyFrameIntervalMax: 50,
      keyFrameIntervalMin: 50,
      bframes: 0,
      sceneCut: 0,
      profile: "high",
      level: 4.1,
      preset: "veryfast",
      tune: "zerolatency",
    },
  },
  {
    name: "medium",
    width: 640,
    height: 360,
    frameRate: { frames: 25, seconds: 1 },
    codec: {
      type: "x264",
      bitrateMode: { value: 650_000, mode: "abr" },
      keyFrameIntervalMax: 50,
      keyFrameIntervalMin: 50,
      bframes: 0,
      sceneCut: 0,
      tune: "zerolatency",
    },
  },
  {
    name: "low",
    width: 320,
    height: 180,
    frameRate: { frames: 25, seconds: 1 },
    codec: {
      type: "x264",
      bitrateMode: { value: 250_000, mode: "abr" },
      keyFrameIntervalMax: 50,
      keyFrameIntervalMin: 50,
      bframes: 0,
      sceneCut: 0,
      tune: "zerolatency",
    },
  },
];

const ladderItem =
  (desiredRendition: string) => (streams: StreamMetadata[]) => {
    const video = videoStreamKeys(streams);
    if (video.length == ladderRungs.length) {
      return video.filter((k) => k.renditionName == desiredRendition);
    }
    return [];
  };
