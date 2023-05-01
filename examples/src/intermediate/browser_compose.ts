import {
  BrowserInputSettings,
  ComposePart,
  ComposeVideoSettings,
  Norsk,
  selectAllVideos,
  selectAudio,
  selectVideo,
  SrtInputSettings,
  StreamMetadata,
  VideoEncodeLadderRung,
  videoStreamKeys,
  videoToPin,
} from "@id3asnorsk/norsk-sdk";

export async function main() {
  const srtSettings: SrtInputSettings = {
    id: "srtInput",
    ip: "127.0.0.1",
    port: 5001,
    mode: "listener",
    sourceName: "srtInput1",
  };

  // Set up some configurations to cycle through
  // Working configuration
  const chopped = { x: 15, y: 18, width: 674, height: 55 };
  const topLeft = { x: 0, y: 0, width: 674, height: 55 };
  const full = { x: 0, y: 0, width: 100, height: 100 };

  const configs = [
    {
      browser: {
        url: "https://app.singular.live/output/6CTPhPRe7yc5lkxgUixA5q/Default?aspect=16:9",
        resolution: { width: 1280, height: 720 },
      },
      sourceRect: full,
      destRect: full,
    },
    {
      browser: {
        // Updates ~1fps
        url: "https://observablehq.com/embed/@mbostock/pixel-clock?cells=display",
        resolution: { width: 720, height: 400 },
      },
      sourceRect: chopped,
      destRect: topLeft,
    },
    {
      browser: {
        // Updates ~1fps
        url: "file:///tmp/index.htm",
        resolution: { width: 720, height: 400 },
      },
      sourceRect: full,
      destRect: full,
    },
  ];
  let updates = 0;
  let config = configs[updates];

  const browserSettings: BrowserInputSettings = {
    url: config.browser.url,
    resolution: config.browser.resolution,
    sourceName: "browserOverlay",
    frameRate: { frames: 25, seconds: 1 },
    onBrowserEvent: (event) => {
      console.log(event);
    },
  };

  const background: ComposePart<"background"> = {
    pin: "background",
    opacity: 1.0,
    zIndex: 0,
    sourceRect: { x: 0, y: 0, width: 100, height: 100 },
    destRect: { x: 0, y: 0, width: 100, height: 100 },
  };
  const overlay: ComposePart<"overlay"> = {
    pin: "overlay",
    opacity: 1.0,
    zIndex: 1,
    sourceRect: config.sourceRect,
    destRect: config.destRect,
  };

  const parts = [background, overlay];

  const composeSettings: ComposeVideoSettings<"background" | "overlay"> = {
    id: "compose",
    referenceStream: background.pin,
    outputResolution: { width: 1280, height: 720 },
    referenceResolution: { width: 100, height: 100 },
    outputPixelFormat: "bgra",
    parts,
  };

  const norsk = await Norsk.connect({
    onShutdown: () => {
      console.log("Norsk has shutdown");
      process.exit(1)
    }
  });

  let input1 = await norsk.input.srt(srtSettings);
  let input2 = await norsk.input.browser(browserSettings);

  let compose = await norsk.processor.transform.composeOverlay(composeSettings);

  compose.subscribeToPins([
    { source: input1, sourceSelector: videoToPin(background.pin) },
    { source: input2, sourceSelector: videoToPin(overlay.pin) },
  ]);

  setInterval(() => {
    let config = configs[updates++ % configs.length];
    input2.updateConfig(config.browser);
    overlay.sourceRect = config.sourceRect;
    overlay.destRect = config.destRect;
    compose.updateConfig({ parts });
  }, 22000);


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
    { source: compose, sourceSelector: selectVideo },
  ]);
  audioInput.subscribe([
    { source: input1, sourceSelector: selectAudio },
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
