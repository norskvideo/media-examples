import {
  BrowserInputSettings,
  CMAFDestinationSettings,
  ComposePart,
  ComposeVideoSettings,
  HlsPushDestinationSettings,
  LocalPullDestinationSettings,
  Norsk,
  selectAllVideos,
  selectAudio,
  selectVideo,
  SrtInputSettings,
  StreamMetadata,
  VideoEncodeLadderRung,
  videoStreamKeys,
  videoToPin,
  X264Codec,
} from "@norskvideo/norsk-sdk";

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
  const chopped = { x: 0, y: 0, width: 674, height: 55 };
  const topLeft = { x: 5, y: 0, width: 674, height: 55 };
  const full = { x: 0, y: 0, width: 100, height: 100 };

  const configs = [
    {
      browser: {
        url: "https://app.singular.live/output/6CTPhPRe7yc5lkxgUixA5q/Default?aspect=16:9",
        resolution: { width: 1280, height: 720 },
      },
      sourceRect: full,
      destRect: full,
      referenceResolution: { width: 100, height: 100 },
    },
    {
      browser: {
        // Updates ~1fps
        url: "https://observablehq.com/embed/@mbostock/pixel-clock?cells=display",
        resolution: { width: 720, height: 400 },
      },
      sourceRect: chopped,
      destRect: topLeft,
      referenceResolution: undefined
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
    referenceResolution: { width: 100, height: 100 },
  };
  const overlay: ComposePart<"overlay"> = {
    pin: "overlay",
    opacity: 1.0,
    zIndex: 1,
    sourceRect: config.sourceRect,
    destRect: config.destRect,
    referenceResolution: config.referenceResolution
  };

  const parts = [background, overlay];

  const composeSettings: ComposeVideoSettings<"background" | "overlay"> = {
    id: "compose",
    referenceStream: background.pin,
    outputResolution: { width: 1280, height: 720 },
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

  let videoInput = await norsk.processor.transform.streamKeyOverride(videoStreamKeyConfig);
  let audioInput = await norsk.processor.transform.streamKeyOverride(audioStreamKeyConfig);

  videoInput.subscribe([
    { source: compose, sourceSelector: selectVideo },
  ]);
  audioInput.subscribe([
    { source: input1, sourceSelector: selectAudio },
  ]);

  function mkRung(name: string, width: number, height: number, bitrate: number, rungSpecificX264Settings?: Partial<X264Codec>): VideoEncodeLadderRung {
    return {
      name,
      width,
      height,
      frameRate: { frames: 25, seconds: 1 },
      codec: {
        type: "x264",
        bitrateMode: { value: bitrate, mode: "abr" },
        keyFrameIntervalMax: 50,
        keyFrameIntervalMin: 50,
        sceneCut: 0,
        bframes: 0,
        tune: "zerolatency",
        ...rungSpecificX264Settings
      },
    };
  }

  let ladderRungs: VideoEncodeLadderRung[] = [
    mkRung("high", 1280, 720, 8000000,
      { // Override some of the default x264 settings for the high rung
        bframes: 3,
        profile: "high",
        level: 4.1,
        preset: "veryfast",
      }),
    mkRung("medium", 640, 360, 250000), // default x264 settings
    mkRung("low", 320, 180, 150000), // default x264 settings
  ];

  let abrLadder = await norsk.processor.transform.videoEncodeLadder({ id: "ladder", rungs: ladderRungs });

  abrLadder.subscribe([{ source: videoInput, sourceSelector: selectVideo }]);

  let segmentSettings = {
    partDurationSeconds: 1.0,
    segmentDurationSeconds: 4.0,
  };
  let destinations: CMAFDestinationSettings[] = [{ type: "local", retentionPeriodSeconds: 10 }]
  
  let masterOutput = await norsk.output.hlsMaster({ id: "master", playlistName: "master", destinations });
  let audioOutput = await norsk.output.hlsAudio({ id: "audio", destinations, ...segmentSettings });
  let highOutput = await norsk.output.hlsVideo({ id: "high", destinations, ...segmentSettings });
  let mediumOutput = await norsk.output.hlsVideo({ id: "medium", destinations, ...segmentSettings });
  let lowOutput = await norsk.output.hlsVideo({ id: "low", destinations, ...segmentSettings });

  // Wire up the ladder
  let ladderItem =
    (desiredRendition: string) => (streams: StreamMetadata[]) => {
      const video = videoStreamKeys(streams);
      // Don't subscribe at all till there is media from every rung in the ladder
      if (video.length == ladderRungs.length) {
        // Just select the one with the desired rendition name
        return video.filter((k) => k.renditionName == desiredRendition);
      }
      return [];
    };

  highOutput.subscribe([{ source: abrLadder, sourceSelector: ladderItem("high") },]);
  mediumOutput.subscribe([{ source: abrLadder, sourceSelector: ladderItem("medium") },]);
  lowOutput.subscribe([{ source: abrLadder, sourceSelector: ladderItem("low") },]);
  audioOutput.subscribe([{ source: audioInput, sourceSelector: selectAudio },]);

  masterOutput.subscribe([
    { source: abrLadder, sourceSelector: selectAllVideos(ladderRungs.length), },
    { source: audioInput, sourceSelector: selectAudio },
  ]);

  console.log(`Local player: ${masterOutput.playlistUrl}`);
}
