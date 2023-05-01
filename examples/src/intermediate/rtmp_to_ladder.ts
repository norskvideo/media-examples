import { Norsk, selectAllVideos, selectAudio, selectVideo, StreamMetadata, VideoEncodeLadderRung, videoStreamKeys } from "@id3asnorsk/norsk-sdk";

export async function main(): Promise<void> {
  const norsk = await Norsk.connect({
    onShutdown: () => {
      console.log("Norsk has shutdown");
      process.exit(1)
    }
  });
  let rtmpInput = { id: "rtmp", port: 5001 };
  let input = await norsk.input.rtmpServer(rtmpInput);

  let videoStreamKeyConfig = {
    id: "video_stream_key",
    streamKey: {
      programNumber: 1,
      renditionName: "video",
      streamId: 256,
      sourceName: "input",
    },
  };

  let audioStreamKeyConfig = {
    id: "audio_stream_key",
    streamKey: {
      programNumber: 1,
      renditionName: "audio",
      streamId: 257,
      sourceName: "input",
    },
  };

  let videoInput = await norsk.processor.transform.streamKeyOverride(
    videoStreamKeyConfig
  );
  let audioInput = await norsk.processor.transform.streamKeyOverride(
    audioStreamKeyConfig
  );

  videoInput.subscribe([
    { source: input, sourceSelector: selectVideo },
  ]);
  audioInput.subscribe([
    { source: input, sourceSelector: selectAudio },
  ]);

  let ladderRungs: VideoEncodeLadderRung[];
  ladderRungs = [
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

  let ladderSettings = {
    id: "ladder",
    rungs: ladderRungs,
  };

  let localRtcSettings = {
    id: "localRtcOutput",
  };
  let ladderItem =
    (desiredRendition: string) => (streams: StreamMetadata[]) => {
      const video = videoStreamKeys(streams);
      if (video.length == ladderRungs.length) {
        return video.filter((k) => k.renditionName == desiredRendition);
      }
      return [];
    };

  let abrLadder = await norsk.processor.transform.videoEncodeLadder(
    ladderSettings
  );
  let localRtcOutput = await norsk.duplex.localWebRTC(localRtcSettings);

  localRtcOutput.subscribe([
    {
      source: abrLadder,
      sourceSelector: selectAllVideos(ladderRungs.length),
    },
    { source: audioInput, sourceSelector: selectAudio },
  ]);

  console.log(`Local player: ${localRtcOutput.playerUrl}`);

  abrLadder.subscribe([{ source: videoInput, sourceSelector: selectVideo }]);

  let masterPlaylistSettings = { id: "master", playlistName: "master" };
  let audio = {
    id: "audio",
    partDurationSeconds: 1.0,
    segmentDurationSeconds: 4.0,
  };
  let high = {
    id: "high",
    partDurationSeconds: 1.0,
    segmentDurationSeconds: 4.0,
  };
  let medium = {
    id: "medium",
    partDurationSeconds: 1.0,
    segmentDurationSeconds: 4.0,
  };
  let low = {
    id: "low",
    partDurationSeconds: 1.0,
    segmentDurationSeconds: 4.0,
  };

  let masterOutput = await norsk.output.hlsMaster(masterPlaylistSettings);
  let audioOutput = await norsk.output.hlsAudio(audio);
  let highOutput = await norsk.output.hlsVideo(high);
  let mediumOutput = await norsk.output.hlsVideo(medium);
  let lowOutput = await norsk.output.hlsVideo(low);

  highOutput.subscribe([
    { source: abrLadder, sourceSelector: ladderItem("high") },
  ]);
  mediumOutput.subscribe([
    { source: abrLadder, sourceSelector: ladderItem("medium") },
  ]);
  lowOutput.subscribe([
    { source: abrLadder, sourceSelector: ladderItem("low") },
  ]);
  audioOutput.subscribe([
    { source: audioInput, sourceSelector: selectAudio },
  ]);

  masterOutput.subscribe([
    {
      source: abrLadder,
      sourceSelector: selectAllVideos(ladderRungs.length),
    },
    { source: audioInput, sourceSelector: selectAudio },
  ]);

  console.log(`Local player: ${masterOutput.playlistUrl}`);
}
