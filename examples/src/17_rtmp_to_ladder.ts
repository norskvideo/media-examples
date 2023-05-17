import { CMAFDestinationSettings, Norsk, selectAllVideos, selectAudio, selectVideo, StreamMetadata, VideoEncodeRung, videoStreamKeys } from "@norskvideo/norsk-sdk";

export async function main(): Promise<void> {
  const norsk = await Norsk.connect();
  let rtmpInput = { id: "rtmp" };
  let input = await norsk.input.rtmpServer(rtmpInput);

  let abrLadder = await norsk.processor.transform.videoEncode({ id: "ladder", rungs: ladderRungs });
  let destinations: CMAFDestinationSettings[] = [{ type: "local", retentionPeriodSeconds: 60 }]
  let masterOutput = await norsk.output.cmafMaster({ id: "master", playlistName: "master", destinations });
  let audioOutput = await norsk.output.cmafAudio({ id: "audio", destinations, ...segmentSettings });
  let highOutput = await norsk.output.cmafVideo({ id: "high", destinations, ...segmentSettings });
  let mediumOutput = await norsk.output.cmafVideo({ id: "medium", destinations, ...segmentSettings });
  let lowOutput = await norsk.output.cmafVideo({ id: "low", destinations, ...segmentSettings });

  highOutput.subscribe([{ source: abrLadder, sourceSelector: ladderItem("high") }]);
  mediumOutput.subscribe([{ source: abrLadder, sourceSelector: ladderItem("medium") }]);
  lowOutput.subscribe([{ source: abrLadder, sourceSelector: ladderItem("low") }]);
  audioOutput.subscribe([{ source: input, sourceSelector: selectAudio }]);

  let allVideoAndAudio = [
    { source: abrLadder, sourceSelector: selectAllVideos(ladderRungs.length) },
    { source: input, sourceSelector: selectAudio },
  ];
  masterOutput.subscribe(allVideoAndAudio);

  console.log(`Local player: ${masterOutput.playlistUrl}`);

  let localRtcOutput = await norsk.duplex.webRtcBrowser({ id: "webrtc" });
  localRtcOutput.subscribe(allVideoAndAudio);

  console.log(`Local player: ${localRtcOutput.playerUrl}`);

  abrLadder.subscribe([{ source: input, sourceSelector: selectVideo }]);
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
      bitrateMode: { value: 8000000, mode: "abr" },
      keyFrameIntervalMax: 50,
      keyFrameIntervalMin: 50,
      bframes: 3,
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
      bitrateMode: { value: 250000, mode: "abr" },
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
      bitrateMode: { value: 150000, mode: "abr" },
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
