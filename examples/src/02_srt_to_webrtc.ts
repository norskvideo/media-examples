import { Norsk, SrtInputSettings, requireAV, selectAV } from "@norskvideo/norsk-sdk"
import { webRtcServerConfig } from "./common/webRtcServerConfig";

export async function main() {
  const norsk = await Norsk.connect();

  const input = await norsk.input.srt(srtInputSettings);
  const output = await norsk.output.whep({ id: "webrtc", ...webRtcServerConfig });

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
