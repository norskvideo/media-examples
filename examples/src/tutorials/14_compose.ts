import {
  AudioMixSettings,
  ComposePart,
  LocalFileInputSettings,
  Norsk,
  OffsetRect,
  SrtInputSettings,
  VideoComposeDefaults,
  VideoComposeSettings,
  audioToPin,
  selectAudio,
  selectVideo,
  videoToPin,
} from "@norskvideo/norsk-sdk";
import { webRtcServerConfig } from "../common/webRtcServerConfig";

export async function main() {
  const srtSettings: SrtInputSettings = {
    id: "srtInput",
    host: "0.0.0.0",
    port: 5001,
    mode: "listener",
    sourceName: "srtInput1",
  };

  const rtmpSettings = { id: "rtmpInput" };

  const topRight = { x: 50, y: 5, width: 45, height: 45 };
  const bottomRight = { x: 50, y: 50, width: 45, height: 45 };
  const bottomLeft = { x: 5, y: 50, width: 45, height: 45 };

  const background: ComposePart<"background"> = {
    pin: "background",
    opacity: 1.0,
    zIndex: 0,
    compose: VideoComposeDefaults.fullscreen()
  };
  const embedded: ((destRect: OffsetRect) => ComposePart<"embedded">) = (destRect) => ({
    pin: "embedded",
    opacity: 1.0,
    zIndex: 1,
    compose: VideoComposeDefaults.percentage({
      sourceRect: { x: 0, y: 0, width: 100, height: 100 },
      destRect: destRect,
    })
  });
  const logo: ComposePart<"logo"> = {
    pin: "logo",
    opacity: 1.0,
    zIndex: 2,
    compose: VideoComposeDefaults.percentage({
      sourceRect: { x: 0, y: 0, width: 100, height: 100 },
      destRect: { x: 5, y: 5, width: 10, height: 14 },
    })
  };

  const parts = [background, embedded(topRight), logo];

  const composeSettings: VideoComposeSettings<
    "background" | "embedded" | "logo"
  > = {
    id: "compose",
    referenceStream: background.pin,
    outputResolution: { width: 1280, height: 720 },
    parts,
    outputPixelFormat: "rgba",
    onError: () => process.exit(), // interval keeps this script alive after nodes close
  };

  const fileSettings: LocalFileInputSettings = {
    fileName: "/mnt/data/Norsk.png",
    sourceName: "logoInput",
    id: "logoInput"
  };

  const norsk = await Norsk.connect();
  const input1 = await norsk.input.srt(srtSettings);
  const input2 = await norsk.input.rtmpServer(rtmpSettings);
  const input3 = await norsk.input.fileImage(fileSettings);

  const compose = await norsk.processor.transform.videoCompose(composeSettings);

  const output = await norsk.output.whep({ id: "webrtc", name: "webrtc", ...webRtcServerConfig });

  compose.subscribeToPins([
    { source: input1, sourceSelector: videoToPin(background.pin) },
    { source: input2, sourceSelector: videoToPin("embedded") },
    { source: input3, sourceSelector: videoToPin(logo.pin) },
  ]);

  const mixerSettings: AudioMixSettings<"input1" | "input2"> = {
    id: "mixer",
    onError: (err) => console.log("MIXER ERR", err),
    channelLayout: "stereo",
    sampleRate: 48000,
    sources: [
      { pin: "input1" },
      { pin: "input2" }
    ],
    outputSource: "output"
  };

  const mixer = await norsk.processor.transform.audioMix(mixerSettings);
  mixer.subscribeToPins([
    { source: input1, sourceSelector: audioToPin('input1') },
    { source: input2, sourceSelector: audioToPin('input2') }
  ]);

  output.subscribe([
    { source: compose, sourceSelector: selectVideo },
    { source: mixer, sourceSelector: selectAudio },
  ]);

  console.log(`WebRTC Player URL: ${output.playerUrl}`);

  let newParts = [background, embedded(topRight), logo];
  let changeCount = 0;
  setInterval(() => {
    switch (changeCount % 4) {
      case 0:
        newParts = [background, embedded(topRight), logo];
        break;
      case 1:
        newParts = [background, embedded(bottomRight), logo];
        break;
      case 2:
        newParts = [background, embedded(bottomLeft), logo];
        break;
      case 3:
        newParts = [background, logo];
        break;
    }
    compose.updateConfig({ parts: newParts });
    changeCount += 1;
  }, 2000);
}
