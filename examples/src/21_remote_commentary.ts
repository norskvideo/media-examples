import {
  AudioMixSettings,
  CmafDestinationSettings,
  Norsk,
  SrtInputSettings,
  StreamMetadata,
  VideoEncodeRung,
  WebRTCBrowserSettings,
  audioToPin,
  selectAllVideos,
  selectAudio,
  selectVideo,
  videoStreamKeys
} from "@norskvideo/norsk-sdk";

export async function main() {
  const norsk = await Norsk.connect();

  let connected = false;
  const srtInputSettings: SrtInputSettings = {
    id: "srtInput",
    ip: "0.0.0.0",
    port: 5001,
    mode: "listener",
    sourceName: "camera1",
    onConnection: (_) => {
      // Accept only 1 srt connection
      if (connected) {
        return { accept: false };
      } else {
        connected = true;
        return { accept: true, sourceName: "source" };
      }
    }
  };
  const input = await norsk.input.srt(srtInputSettings);

  const previewLadder: VideoEncodeRung[] = [
    {
      name: "low",
      width: 854,
      height: 480,
      frameRate: { frames: 25, seconds: 1 },
      codec: {
        type: "x264",
        keyFrameIntervalMax: 50,
        keyFrameIntervalMin: 50,
        sceneCut: 0,
        tune: "zerolatency",
        bitrateMode: { value: 800000, mode: "abr" }
      },
    },
  ];
  const previewEncode = await norsk.processor.transform.videoEncode({
    id: "preview_ladder",
    rungs: previewLadder,
  });
  previewEncode.subscribe([
    { source: input, sourceSelector: selectVideo }
  ]);

  // Preview WebRTC node, subscribed to the preview-quality video encode and input audio
  // And outputting media from the connected browser
  const previewRtc = await norsk.duplex.webRtcBrowser({
    id: "previewRtc",
    ...webRtcServerConfig()
  });
  previewRtc.subscribe([
    { source: previewEncode, sourceSelector: selectVideo },
    { source: input, sourceSelector: selectAudio }
  ]);
  console.log(`Commentary WebRTC client: ${previewRtc.playerUrl}`);

  const mixerSettings: AudioMixSettings<"source" | "comms"> = {
    id: "mixer",
    onError: (err) => console.log("MIXER ERR", err),
    sampleRate: 48000,
    sources: [
      { pin: "source" },
      { pin: "comms" }
    ],
    outputSource: "source",
  };
  const mixer = await norsk.processor.transform.audioMix(mixerSettings);
  mixer.subscribeToPins([
    { source: input, sourceSelector: audioToPin('source') },
    { source: previewRtc, sourceSelector: audioToPin('comms') }
  ]);

  const finalLadder: VideoEncodeRung[] = [
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
    }
  ];

  const finalEncode = await norsk.processor.transform.videoEncode({
    id: "final_ladder",
    rungs: finalLadder,
  });
  finalEncode.subscribe([{ source: input, sourceSelector: selectVideo }]);
  const destinations: CmafDestinationSettings[] = [{ type: "local", retentionPeriodSeconds: 10 }]
  const masterPlaylistSettings = { id: "master", playlistName: "master", destinations };
  const mediaSettings = {
    partDurationSeconds: 1.0,
    segmentDurationSeconds: 4.0,
    destinations,
  };

  const masterOutput = await norsk.output.cmafMaster(masterPlaylistSettings);
  const audioOutput = await norsk.output.cmafAudio({ id: "audio", ...mediaSettings });
  const highOutput = await norsk.output.cmafVideo({ id: "high", ...mediaSettings });
  const mediumOutput = await norsk.output.cmafVideo({ id: "medium", ...mediaSettings });
  const lowOutput = await norsk.output.cmafVideo({ id: "low", ...mediaSettings });

  const ladderItem =
    (desiredRendition: string) => (streams: StreamMetadata[]) => {
      const video = videoStreamKeys(streams);
      if (video.length == finalLadder.length) {
        return video.filter((k) => k.renditionName == desiredRendition);
      }
      return [];
    };
  highOutput.subscribe([
    { source: finalEncode, sourceSelector: ladderItem("high") },
  ]);
  mediumOutput.subscribe([
    { source: finalEncode, sourceSelector: ladderItem("medium") },
  ]);
  lowOutput.subscribe([
    { source: finalEncode, sourceSelector: ladderItem("low") },
  ]);
  audioOutput.subscribe([
    { source: mixer, sourceSelector: selectAudio },
  ]);

  masterOutput.subscribe([
    {
      source: finalEncode,
      sourceSelector: selectAllVideos(finalLadder.length),
    },
    { source: mixer, sourceSelector: selectAudio },
  ]);

  console.log(`Local player: ${masterOutput.playlistUrl}`);
}
function webRtcServerConfig(): WebRTCBrowserSettings {
  return (process.env.TURN_INTERNAL && process.env.TURN_EXTERNAL) ?
    // Separate hostnames for server and client access to the turn server as in some cases they cannot resolve the same IP
    {
      iceServers: [{ urls: [`turn:${process.env.TURN_INTERNAL}:3478`], username: "norsk", credential: "norsk" }],
      reportedIceServers: [{ urls: [`turn:${process.env.TURN_EXTERNAL}:3478`], username: "norsk", credential: "norsk" }]
    }
    :
    { iceServers: [] };
}
