import express from "express";
import {
  Norsk,
  videoStreamKeys,
  ComposeVideoNode,
  PinToKey,
  audioStreamKeys,
  mkSine,
  MediaNodeId,
  StreamMetadata,
  SrtInputSettings,
  VideoEncodeLadderRung,
  selectVideo,
  selectAudio,
  ComposePart,
  ComposeVideoSettings,
  videoToPin,
  AudioMixerSettings,
  audioToPin,
  selectAllVideos,
} from "@id3asnorsk/norsk-sdk";

export async function main() {
  const norsk = await Norsk.connect({});

  let connected = false;
  let srtInputSettings: SrtInputSettings = {
    id: "srtInput",
    ip: "127.0.0.1",
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
  let input = await norsk.input.srt(srtInputSettings);

  let previewLadder: VideoEncodeLadderRung[] = [
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
  let previewEncode = await norsk.processor.transform.videoEncodeLadder({
    id: "preview_ladder",
    rungs: previewLadder,
  });
  previewEncode.subscribe([
    { source: input, sourceSelector: selectVideo }
  ]);

  // Preview WebRTC node, subscribed to the preview-quality video encode and input audio
  // And outputting media from the connected browser
  let previewRtc = await norsk.duplex.localWebRTC({ id: "previewRtc" });
  previewRtc.subscribe([
    { source: previewEncode, sourceSelector: selectVideo },
    { source: input, sourceSelector: selectAudio }
  ]);


  let mixerSettings: AudioMixerSettings<"source" | "comms"> = {
    id: "mixer",
    onError: (err) => console.log("MIXER ERR", err),
    sampleRate: 48000,
    sources: [{ pin: "source" }
      , { pin: "comms" }
    ],
    outputSource: "source",
  };
  let mixer = await norsk.processor.transform.audioMixer(mixerSettings);
  mixer.subscribeToPins([
    { source: input, sourceSelector: audioToPin('source') },
    { source: previewRtc, sourceSelector: audioToPin('comms') }
  ]);

  let finalLadder: VideoEncodeLadderRung[] = [
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

  let finalEncode = await norsk.processor.transform.videoEncodeLadder({
    id: "final_ladder",
    rungs: finalLadder,
  });
  finalEncode.subscribe([{ source: input, sourceSelector: selectVideo }]);

  let masterPlaylistSettings = { id: "master", playlistName: "master" };
  let mediaSettings = {
    partDurationSeconds: 1.0,
    segmentDurationSeconds: 4.0,
  };

  let masterOutput = await norsk.output.hlsMaster(masterPlaylistSettings);
  let audioOutput = await norsk.output.hlsAudio({ id: "audio", ...mediaSettings });
  let highOutput = await norsk.output.hlsVideo({ id: "high", ...mediaSettings });
  let mediumOutput = await norsk.output.hlsVideo({ id: "medium", ...mediaSettings });
  let lowOutput = await norsk.output.hlsVideo({ id: "low", ...mediaSettings });

  let ladderItem =
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
