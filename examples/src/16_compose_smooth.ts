
import {
  ComposePart,
  VideoComposeSettings,
  Norsk,
  selectAudio,
  selectVideo,
  SrtInputSettings,
  videoToPin,
} from "@norskvideo/norsk-sdk"

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

  const background: ComposePart<"background"> = {
    pin: "background",
    opacity: 1.0,
    zIndex: 0,
    sourceRect: { x: 0, y: 0, width: 100, height: 100 },
    destRect: { x: 0, y: 0, width: 100, height: 100 },
    id: "background",
    transition: { durationMs: 1000.0 },
  };
  const embedded: ComposePart<"embedded"> = {
    pin: "embedded",
    opacity: 1.0,
    zIndex: 1,
    sourceRect: { x: 0, y: 0, width: 100, height: 100 },
    destRect: topRight,
    id: "embed",
    transition: { durationMs: 1000.0, easing: "ease_in" },
  };

  const parts = [background, embedded];

  const composeSettings: VideoComposeSettings<"background" | "embedded"> = {
    id: "compose",
    referenceStream: background.pin,
    referenceResolution: { width: 100, height: 100 }, // make it % based
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
  let input1 = await norsk.input.srt(srtSettings);
  let input2 = await norsk.input.rtmpServer(rtmpSettings);

  let compose = await norsk.processor.transform.videoCompose(composeSettings);

  let output = await norsk.duplex.webRtcBrowser({ id: "webrtc" });

  compose.subscribeToPins([
    { source: input1, sourceSelector: videoToPin(background.pin) },
    { source: input2, sourceSelector: videoToPin(embedded.pin) },
  ]);

  output.subscribe([
    { source: compose, sourceSelector: selectVideo },
    { source: input1, sourceSelector: selectAudio },
  ]);

  console.log(`Local player: ${output.playerUrl}`);

  let newParts = [background, { ...embedded, destRect: topRight }];
  let changeCount = 0;
  setInterval(() => {
    switch (changeCount % 5) {
      case 0:
        newParts = [background, { ...embedded, destRect: bottomRight }];
        break;
      case 1:
        newParts = [background, { ...embedded, destRect: full }];
        break;
      case 2:
        newParts = [background, { ...embedded, destRect: full, opacity: 0.0 }];
        break;
      case 3:
        newParts = [
          { ...embedded, destRect: full, opacity: 1.0, transition: undefined },
          { ...background, zIndex: 2 },
        ];
        break;
      case 4:
        newParts = [
          { ...embedded, destRect: full, opacity: 1.0 },
          { ...background, zIndex: 2, destRect: bottomLeft },
        ];
        break;
    }
    compose.updateConfig({ parts: newParts });
    changeCount += 1;
  }, 2000);
}
