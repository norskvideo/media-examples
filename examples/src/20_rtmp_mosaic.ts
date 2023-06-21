import {
  AudioSignalGeneratorNode,
  AudioSignalGeneratorSettings,
  Norsk,
  OnStreamResult,
  PinToKey,
  RtmpServerInputNode,
  RtmpServerStreamKeys,
  StreamMetadata,
  VideoComposeNode,
  VideoEncodeRung,
  audioStreamKeys,
  mkSine,
  videoStreamKeys,
} from "@norskvideo/norsk-sdk";

export async function main() {
  const norsk = await Norsk.connect();

  let audioSignalInput = await norsk.input.audioSignal(audioInputSettings());

  let mosaic = new Mosaic(norsk, audioSignalInput);

  await mosaic.run();
}

class Mosaic {
  norsk: Norsk;
  audioSignalInput: AudioSignalGeneratorNode;
  rtmpInput: RtmpServerInputNode | undefined;
  compose: VideoComposeNode<string> | undefined = undefined;
  streams: string[] = [];
  composeCreatePending: boolean = false;

  constructor(norsk: Norsk, audioSignalInput: AudioSignalGeneratorNode) {
    this.norsk = norsk;
    this.audioSignalInput = audioSignalInput;
  }

  async run() {
    this.rtmpInput = await this.norsk.input.rtmpServer({
      id: "rtmp",
      port: 1935,
      onConnection: this.onConnection.bind(this),
      onStream: this.onStream.bind(this),
      onConnectionStatusChange: this.onConnectionStatusChange.bind(this)
    });
  }

  onConnection(_cid: string, app: string, _url: string) {
    if (app === "mosaic") {
      return { accept: true };
    } else {
      return { accept: false, reason: "App name must be mosaic" };
    }
  }

  onStream(_cid: string, _app: string, _url: string, _streamId: number, publishingName: string): OnStreamResult {
    this.streams.push(publishingName);
    this.handleStreamChange();

    return {
      accept: true,
      videoStreamKey: {
        renditionName: "default",
        sourceName: publishingName,
      },
      audioStreamKey: {
        renditionName: "default",
        sourceName: publishingName,
      },
    };
  }

  onConnectionStatusChange(_cid: string, status: string, streamKeys: RtmpServerStreamKeys) {
    if (status !== "disconnected") {
      // "I only know about one state";
      return;
    }
    for (let key of streamKeys) {
      let stream = key.videoStreamKey?.sourceName?.sourceName;
      this.streams = this.streams.filter((x) => x !== stream);
      console.log(`Stream disconnected: ${stream}`);
      this.handleStreamChange();
    }
  }

  handleStreamChange() {
    if (this.compose === undefined && this.streams.length > 0 && !this.composeCreatePending) {
      this.composeCreatePending = true;
      this.norsk.processor.transform
        .videoCompose({
          id: "compose",
          referenceStream: this.streams[0],
          referenceResolution: { width: 100, height: 100 }, // make it % based
          outputResolution: { width: 1280, height: 720 },
          parts: createParts(this.streams),
        })
        .then(async (x) => {
          this.compose = x;
          this.compose?.subscribeToPins([
            {
              source: this.rtmpInput!,
              sourceSelector: (streamMetadata: StreamMetadata[]) => {
                let pins: PinToKey<string> = {};
                for (let stream of this.streams) {
                  pins[stream] = videoStreamKeys(streamMetadata).filter(
                    (x) => x?.sourceName == stream
                  );
                }
                return pins;
              },
            },
          ]);

          let encode = await this.norsk.processor.transform.videoEncode({
            id: "ladder1",
            rungs: [mkRung("high", 854, 480, 800000)]
          });
          encode.subscribe([
            { source: this.compose, sourceSelector: videoStreamKeys },
          ]);

          let output = await this.norsk.output.hlsTsVideo({
            id: "video",
            segmentDurationSeconds: 4.0,
            destinations: [{ type: "local", retentionPeriodSeconds: 60 }],
          });
          output.subscribe([
            { source: encode, sourceSelector: videoStreamKeys },
          ]);
          console.log(
            "Media playlist",
            "http://localhost:8080/cmaf/file/stream/source1-1-2-high/playlist.m3u8"
          );

          let rtcOutput = await this.norsk.output.whep({ id: "webrtc" });
          rtcOutput.subscribe([
            { source: encode, sourceSelector: videoStreamKeys },
            { source: this.audioSignalInput, sourceSelector: audioStreamKeys },
          ]);
          console.log("Local player: " + rtcOutput.playerUrl);
        });
    } else if (this.compose != undefined && this.streams.length > 0) {
      this.compose?.updateConfig({ parts: createParts(this.streams) });
    }
    else if (this.streams.length > 0) {
      setInterval(this.handleStreamChange.bind(this), 500);
    }
  };
}

function createParts(streams: string[]) {
  let division = Math.ceil(Math.sqrt(streams.length));
  return streams.map((stream, i) => ({
    destRect: {
      width: 100 / division,
      height: 100 / division,
      x: (100 / division) * (i % division),
      y: (100 / division) * Math.floor(i / division),
    },
    opacity: 1.0,
    pin: stream,
    sourceRect: { x: 0, y: 0, width: 100, height: 100 },
    zIndex: 1,
  }));
}

function audioInputSettings(): AudioSignalGeneratorSettings {
  return {
    sourceName: "wave1",
    channelLayout: "stereo",
    sampleRate: 48000,
    sampleFormat: "s16p",
    wave: mkSine(220),
  };
}

function mkRung(name: string, width: number, height: number, bitrate: number): VideoEncodeRung {
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
    },
  };
}

