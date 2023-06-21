import { Norsk, SrtInputSettings, StreamMetadata, WebRTCBrowserSettings, WhepOutputSettings, requireAV, selectAV } from "@norskvideo/norsk-sdk"

export async function main() {
  const norsk = await Norsk.connect();

  let input = await norsk.input.srt(srtInputSettings);
  let output = await norsk.output.whep(whepOutputSettings);

  output.subscribe([{ source: input, sourceSelector: selectAV }], requireAV);
  console.log(`Local player: ${output.playerUrl}`);
}

const srtInputSettings: SrtInputSettings = {
  id: "srtInput",
  ip: "0.0.0.0",
  port: 5001,
  mode: "listener",
  sourceName: "camera1",
};
const whepOutputSettings: WhepOutputSettings = {
  id: "webrtc"
};
