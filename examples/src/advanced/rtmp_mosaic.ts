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
  AudioSignalGeneratorSettings,
} from "@id3asnorsk/norsk-sdk";

export async function main() {
  const norsk = await Norsk.connect({});

  // Should this be a class with state rather than the handleNewStream with closures over local variables?
  let streams: string[] = [];
  let handleNewStream = () => { };

  let audioSignalInput = await norsk.input.audioSignal(audioInputSettings());

  let input = await norsk.input.rtmpServer(
    {
      id: "rtmp",
      port: 1935,
      onConnection: (app, url) => {
        if (app === "mosaic") {
          return ({ accept: true });
        } else {
          return ({ accept: false, reason: "App name must be mosaic" })
        }
      },
      onStream: (_app, _url, _streamId, publishingName) => {
        streams.push(publishingName);
        handleNewStream();

        return { accept: true, videoStreamKey: { renditionName: "default", sourceName: publishingName }, audioStreamKey: { renditionName: "default", sourceName: publishingName } }
      },
      onConnectionStatusChange: (status, streamKeys) => {
        if (status !== "disconnected") {
          throw "I only know about one state"
        }
        for (let key of streamKeys) {
          let stream = key.videoStreamKey?.sourceName?.sourceName;
          streams = streams.filter(x => x !== stream);
          console.log(`Stream disconnected: ${stream}`);
        }
      }
    }
  );

  let compose: ComposeVideoNode<string> | undefined = undefined;
  handleNewStream = () => {
    if (compose === undefined && streams.length > 0) {
      norsk.processor.transform.composeOverlay({
        id: "compose",
        referenceStream: streams[0],
        referenceResolution: { width: 100, height: 100 }, // make it % based
        outputResolution: { width: 1280, height: 720 },
        parts: createParts(streams)
      }).then(async x => {
        compose = x;
        compose.subscribeToPins([{
          source: input,
          sourceSelector: (streamMetadata: StreamMetadata[]) => {
            let pins: PinToKey<string> = {};
            for (let stream of streams) {
              pins[stream] = videoStreamKeys(streamMetadata).filter(x => x?.sourceName == stream);
            }
            return pins;
          }
        }]);

        let encode = await norsk.processor.transform.videoEncodeLadder({
          id: "ladder1",
          rungs: [
            {
              name: "high",
              width: 854,
              height: 480,
              frameRate: { frames: 25, seconds: 1 },
              codec: {
                type: "x264",
                bitrateMode: { value: 800000, mode: "abr" },
                keyFrameIntervalMax: 50,
                keyFrameIntervalMin: 50,
                bframes: 0,
                sceneCut: 0,
                tune: "zerolatency",
              }
            }
          ]
        });
        encode.subscribe([{ source: compose, sourceSelector: videoStreamKeys }]);
        let output = await norsk.output.hlsTsVideo({ id: "video", segmentDurationSeconds: 4.0 });
        output.subscribe([
          { source: encode, sourceSelector: videoStreamKeys },
        ]);
        console.log("Media playlist", "http://localhost:6791/localHls/file/stream/256-high/playlist.m3u8");

        let rtcOutput = await norsk.duplex.localWebRTC({ id: "localRtcOutput" });
        rtcOutput.subscribe([
          { source: encode, sourceSelector: videoStreamKeys },
          { source: audioSignalInput, sourceSelector: audioStreamKeys }
        ]);
        console.log("Local player: " + rtcOutput.playerUrl);
      });
    } else if (streams.length > 1) {
      compose?.updateConfig({ parts: createParts(streams) });
    }
  };
}

function createParts(streams: string[]) {
  let division = Math.ceil(Math.sqrt(streams.length));
  return streams.map((stream, i) => (
    {
      destRect: {
        width: 100 / division,
        height: 100 / division,
        x: (100 / division) * (i % division),
        y: (100 / division) * Math.floor(i / division)
      }, opacity: 1.0, pin: stream, sourceRect: { x: 0, y: 0, width: 100, height: 100 }, zIndex: 1
    }));
}

function audioInputSettings(): AudioSignalGeneratorSettings {
  return ({
    sourceName: "wave1",
    channelLayout: "stereo",
    sampleRate: 48000,
    sampleFormat: "s16p",
    wave: mkSine(220)
  });
}
