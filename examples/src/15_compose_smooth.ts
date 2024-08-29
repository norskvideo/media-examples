import {
  ComposePart,
  Norsk,
  OffsetRect,
  SrtInputSettings,
  VideoComposeDefaults,
  VideoComposeSettings,
  selectAudio,
  selectVideo,
  videoToPin,
} from "@norskvideo/norsk-sdk"
import { webRtcServerConfig } from "./common/webRtcServerConfig";

export async function main() {
  const srtSettings: SrtInputSettings = {
    id: "srtInput",
    ip: "0.0.0.0",
    port: 5001,
    mode: "listener",
    sourceName: "srtInput1",
  };

  const rtmpSettings = { id: "rtmpInput" };

  const topRight = { x: 50, y: 5, width: 45, height: 45 };
  const bottomRight = { x: 50, y: 50, width: 45, height: 45 };
  const full = { x: 0, y: 0, width: 100, height: 100 };
  const bottomLeft = { x: 5, y: 50, width: 45, height: 45 };

  const background: (destRect?: OffsetRect) => ComposePart<"background"> = (destRect) => ({
    pin: "background",
    opacity: 1.0,
    zIndex: 0,
    compose: VideoComposeDefaults.percentage({
      sourceRect: { x: 0, y: 0, width: 100, height: 100 },
      destRect: destRect ?? { x: 0, y: 0, width: 100, height: 100 },
    }),
    id: "background",
    transition: { durationMs: 1000.0 },
  });
  const embedded: (destRect: OffsetRect) => ComposePart<"embedded"> = (destRect) => ({
    pin: "embedded",
    opacity: 1.0,
    zIndex: 1,
    compose: VideoComposeDefaults.percentage({
      sourceRect: { x: 0, y: 0, width: 100, height: 100 },
      destRect,
    }),
    id: "embed",
    transition: { durationMs: 1000.0, easing: "ease_in" },
  });

  const parts = [background(), embedded(topRight)];

  const composeSettings: VideoComposeSettings<"background" | "embedded"> = {
    id: "compose",
    referenceStream: "background",
    outputResolution: { width: 1280, height: 720 },
    parts,
    onError: (_err) => process.exit(), // interval keeps this script alive after nodes close
  };

  const norsk = await Norsk.connect({
    onShutdown: () => {
      console.log("Norsk has shutdown");
      process.exit(1)
    }
  });
  const input1 = await norsk.input.srt(srtSettings);
  const input2 = await norsk.input.rtmpServer(rtmpSettings);

  const compose = await norsk.processor.transform.videoCompose(composeSettings);

  const output = await norsk.output.whep({ id: "webrtc", ...webRtcServerConfig });

  compose.subscribeToPins([
    { source: input1, sourceSelector: videoToPin("background") },
    { source: input2, sourceSelector: videoToPin("embedded") },
  ]);

  output.subscribe([
    { source: compose, sourceSelector: selectVideo },
    { source: input1, sourceSelector: selectAudio },
  ]);

  console.log(`WebRTC Player URL: ${output.playerUrl}`);

  let newParts = [background(), embedded(topRight)];
  let changeCount = 0;
  setInterval(() => {
    switch (changeCount % 5) {
      case 0:
        newParts = [background(), embedded(bottomRight)];
        break;
      case 1:
        newParts = [background(), embedded(full)];
        break;
      case 2:
        newParts = [background(), { ...embedded(full), opacity: 0.0 }];
        break;
      case 3:
        newParts = [
          { ...embedded(full), opacity: 1.0, transition: undefined },
          { ...background(), zIndex: 2 },
        ];
        break;
      case 4:
        newParts = [
          { ...embedded(full), opacity: 1.0 },
          { ...background(bottomLeft), zIndex: 2 },
        ];
        break;
    }
    compose.updateConfig({ parts: newParts });
    changeCount += 1;
  }, 2000);
}
