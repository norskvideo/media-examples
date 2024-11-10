import {
  AudioSignalGeneratorSettings,
  BrowserInputSettings,
  ComposePart,
  LocalFileInputSettings,
  Norsk,
  ProcessorMediaNode,
  SourceMediaNode,
  SrtInputSettings,
  StreamSwitchSmoothSettings,
  VideoComposeSettings,
  audioStreamKeys,
  audioToPin,
  avToPin,
  clientHostExternal,
  clientHostInternal,
  mkSine,
  selectAV,
  selectAudio,
  selectVideo,
  videoStreamKeys,
  videoToPin,
  RtmpOutputNode,
  ReceiveFromAddressAuto,
  VideoComposeDefaults,
} from "@norskvideo/norsk-sdk";
import {
  DescribeFlowCommand,
  ListFlowsCommand,
  MediaConnectClient,
} from "@aws-sdk/client-mediaconnect";

import express from "express";
import {
  DescribeChannelCommand,
  DescribeInputCommand,
  ListChannelsCommand,
  MediaLiveClient,
} from "@aws-sdk/client-medialive";

const app = express();
const port = 3000;

const region = "eu-west-2";

const mediaConnectInput: boolean = process.env.MEDIA_CONNECT_INPUT === "true";
const mediaLiveOutput: boolean = process.env.MEDIA_LIVE_OUTPUT === "true";

type SourceOrSlate = {
  node: ProcessorMediaNode<string>;
  addSource: (source: SourceMediaNode) => void;
};

export async function main() {
  const slateFileSettings: LocalFileInputSettings = {
    fileName: "/mnt/data/Slate720x1280.png",
    sourceName: "slate",
    id: "slate",
  };

  runWebServer();

  const norsk = await Norsk.connect();

  // Setup the speaker source and the slate to swap to if the speaker disconnects
  const slateVideo = await norsk.input.fileImage(slateFileSettings);
  const slateAudio = await norsk.input.audioSignal(audioSignalSettings);

  const speakerOrSlate = await sourceOrSlate(
    "speakerOrSlate",
    norsk,
    slateVideo,
    slateAudio
  );

  await startSrtSource(norsk, speakerOrSlate);

  // Setup the browser input, where we get the 'slides' from
  const browserBackgroundSettings: BrowserInputSettings = {
    id: "browser",
    url: `http://${clientHostInternal()}:${port}/static/98_slides.html`,
    resolution: { width: 1280, height: 720 },
    sourceName: "browserOverlay",
    frameRate: { frames: 25, seconds: 1 },
  };

  const browserBackgroundInput = await norsk.input.browser(
    browserBackgroundSettings
  );

  // Setup the composition where we merge the speaker and the slides
  const landscapeFull = { width: 1280, height: 720 };
  const embeddedPortraitSize = { width: 261, height: 464 };
  const embeddedPortraitPosition = { x: 45, y: 130 };

  const slidesPart: ComposePart<"slides"> = {
    pin: "slides",
    opacity: 1.0,
    zIndex: 0,
    compose: VideoComposeDefaults.fullscreen()
  };

  const speakerPart: ComposePart<"speaker"> = {
    pin: "speaker",
    opacity: 1.0,
    zIndex: 1,
    compose: (p) => {
      return {
        sourceRect: { x: 0, y: 0, width: p.width, height: p.height },
        destRect: { ...embeddedPortraitPosition, ...embeddedPortraitSize }
      }
    }
  };

  const parts = [speakerPart, slidesPart];

  const composeSettings: VideoComposeSettings<"speaker" | "slides"> = {
    id: "compose",
    referenceStream: slidesPart.pin,
    outputResolution: landscapeFull,
    outputPixelFormat: "bgra",
    parts,
  };

  const compose = await norsk.processor.transform.videoCompose(composeSettings);

  // And two whep outputs - one for the speaker (or slate) and one for the
  // final output
  const speakerPreview = await norsk.output.whep({ id: "speakerPreview" });
  const slideSpeakerOutput = await norsk.output.whep({ id: "slideSpeaker" });

  // And wire things up...
  compose.subscribeToPins([
    { source: browserBackgroundInput, sourceSelector: videoToPin("slides") },
    { source: speakerOrSlate.node, sourceSelector: videoToPin("speaker") },
  ]);

  speakerPreview.subscribe([
    { source: speakerOrSlate.node, sourceSelector: selectAV },
  ]);

  const mainOutput = [
    { source: compose, sourceSelector: selectVideo },
    { source: speakerOrSlate.node, sourceSelector: selectAudio },
  ];
  slideSpeakerOutput.subscribe(mainOutput);

  console.log(`speaker: ${speakerPreview.playerUrl}`);
  console.log(`slideSpeakerOutput : ${slideSpeakerOutput.playerUrl}`);

  const rtmpUrl = await getRtmpOutputUrl();
  const _output = new RtmpOutputWithRetry(norsk, mainOutput, rtmpUrl);
  //await output.run();
}

function runWebServer() {
  app.use(express.json());
  app.use("/static", express.static("static"));
  app.listen(port, () => {
    const host = clientHostExternal();
    console.log(
      `The overlay is running at http://${host}:${port}/static/98_slides.html`
    );
  });
}

const audioSignalSettings: AudioSignalGeneratorSettings = {
  id: "audio-signal",
  sourceName: "signal",
  channelLayout: "stereo",
  sampleRate: 48000,
  wave: mkSine(1), // inaudible, so acts as comfort silence
};

// Find the details for the Media Live endpoint
async function findMediaLiveInput(name: string): Promise<string | null> {
  const client = new MediaLiveClient({ region });

  try {
    const listResponse = await client.send(
      new ListChannelsCommand({ MaxResults: 100 })
    );
    const channels = listResponse.Channels;

    if (channels) {
      const matchingChannel = channels.find((channel) => channel.Name === name);
      if (matchingChannel) {
        const describeChannelResponse = await client.send(
          new DescribeChannelCommand({ ChannelId: matchingChannel.Id })
        );
        if (
          describeChannelResponse.InputAttachments &&
          describeChannelResponse.InputAttachments.length > 0 &&
          describeChannelResponse.InputAttachments[0].InputId
        ) {
          const describeInputResponse = await client.send(
            new DescribeInputCommand({
              InputId: describeChannelResponse.InputAttachments[0].InputId,
            })
          );
          if (
            describeInputResponse.Destinations &&
            describeInputResponse.Destinations.length > 0 &&
            describeInputResponse.Destinations[0].Url
          ) {
            return describeInputResponse.Destinations[0].Url;
          }
        }
      }
    }
    return null;
  } catch (error) {
    console.error("Error finding MediaLiveInput:", error);
    return null;
  }
}

// Find the details for the Media Connect Flow output
async function findMediaConnectFlow(
  flowName: string
): Promise<{ ip: string; port: number } | null> {
  const client = new MediaConnectClient({ region });

  try {
    const response = await client.send(
      new ListFlowsCommand({ MaxResults: 100 })
    );
    const flows = response.Flows;

    if (flows) {
      const matchingFlow = flows.find((flow) => flow.Name === flowName);
      if (matchingFlow) {
        const res = await client.send(
          new DescribeFlowCommand({ FlowArn: matchingFlow.FlowArn })
        );
        if (
          res.Flow &&
          res.Flow.Outputs &&
          res.Flow.Outputs.length > 0 &&
          res.Flow.Outputs[0].ListenerAddress &&
          res.Flow.Outputs[0].Port
        ) {
          const ip = res.Flow.Outputs[0].ListenerAddress;
          const port = res.Flow.Outputs[0].Port;

          console.log(
            `Found matching flow: ${matchingFlow.Name}, ${ip}:${port}`
          );

          return {
            ip,
            port,
          };
        }
      }
      console.log(`No matching flow for ${flowName}`);
      return null;
    }
    return null;
  } catch (error) {
    console.error("Error finding MediaConnect flow:", error);
    return null;
  }
}

async function getRtmpOutputUrl(): Promise<string> {
  if (mediaLiveOutput) {
    const rtmpOutputUrl = await findMediaLiveInput("NorskTest");

    if (!rtmpOutputUrl) {
      throw new Error("No MediaLive input found");
    }
    return rtmpOutputUrl;
  } else {
    return "rtmp://127.0.0.1:1935/norsk/output";
  }
}

class RtmpOutputWithRetry {
  norsk: Norsk;
  sources: ReceiveFromAddressAuto[];
  rtmpUrl: string;
  output: RtmpOutputNode | undefined;

  constructor(
    norsk: Norsk,
    sources: ReceiveFromAddressAuto[],
    rtmpUrl: string
  ) {
    this.norsk = norsk;
    this.sources = sources;
    this.rtmpUrl = rtmpUrl;
  }

  async run() {
    this.output = await this.norsk.output.rtmp({
      id: "rtmpOutput",
      url: this.rtmpUrl,
      onClose: () => this.retry(),
    });
    this.output.subscribe(
      this.sources,
      (context) => context.streams.length === 2
    );
  }

  retry() {
    setTimeout(() => {
      void this.run();
    }, 2000);
  }
}

async function getSrtInputSettings(): Promise<SrtInputSettings | null> {
  if (mediaConnectInput) {
    const ipAndPort = await findMediaConnectFlow("NorskFlow");

    if (!ipAndPort) {
      return null;
    }

    return {
      id: "speaker",
      host: ipAndPort.ip,
      port: ipAndPort.port,
      mode: "caller",
      sourceName: "speaker",
    };
  } else {
    return {
      id: "speaker",
      host: "0.0.0.0",
      port: 5001,
      mode: "listener",
      sourceName: "speaker",
    };
  }
}

async function startSrtSource(norsk: Norsk, switcher: SourceOrSlate) {
  const srtSettings = await getSrtInputSettings();

  if (!srtSettings) {
    setTimeout(() => void startSrtSource(norsk, switcher), 1000);
  } else {
    const speaker = await norsk.input.srt(srtSettings);

    switcher.addSource(speaker);
  }
}

async function sourceOrSlate(
  id: string,
  norsk: Norsk,
  slateVideo: SourceMediaNode,
  slateAudio: SourceMediaNode
): Promise<SourceOrSlate> {
  // Start with the slate until the source is active
  const streamSwitchSmoothSettings: StreamSwitchSmoothSettings<
    "slate" | "source"
  > = {
    id: `${id}.sss`,
    activeSource: "slate",
    outputSource: "output",
    outputResolution: { width: 720, height: 1280 },
    transitionDurationMs: 2000.0,
    sampleRate: 48000,
    frameRate: { frames: 25, seconds: 1 },
    channelLayout: "stereo",
    onInboundContextChange: async (allStreams) => {
      const sourceEntry = allStreams.get("source");
      if (sourceEntry) {
        if (
          videoStreamKeys(sourceEntry).length === 1 &&
          audioStreamKeys(sourceEntry).length === 1
        ) {
          streamSwitcher.switchSource("source");
        } else {
          streamSwitcher.switchSource("slate");
        }
      } else {
        streamSwitcher.switchSource("slate");
      }
    },
  };
  console.log("Stream switcher settings: ", streamSwitchSmoothSettings);
  const streamSwitcher = await norsk.processor.control.streamSwitchSmooth(
    streamSwitchSmoothSettings
  );

  streamSwitcher.subscribeToPins([
    { source: slateVideo, sourceSelector: videoToPin("slate") },
    { source: slateAudio, sourceSelector: audioToPin("slate") },
  ]);

  return {
    node: streamSwitcher,
    addSource: (source) => {
      streamSwitcher.subscribeToPins([
        { source: slateVideo, sourceSelector: videoToPin("slate") },
        { source: slateAudio, sourceSelector: audioToPin("slate") },
        { source: source, sourceSelector: avToPin("source") },
      ]);
    },
  };
}

