import { Norsk, SrtInputSettings, StreamMetadata, selectAV } from "@norskvideo/norsk-sdk"

export async function main() {
  const norsk = await Norsk.connect();

  let input = await norsk.input.srt(srtInputSettings);
  let output = await norsk.duplex.webRtcBrowser({ id: "webrtc" })

  output.subscribe([{ source: input, sourceSelector: selectAV }]);
  console.log(`Local player: ${output.playerUrl}`);
}

const srtInputSettings: SrtInputSettings = {
  id: "srtInput",
  ip: "127.0.0.1",
  port: 5001,
  mode: "listener",
  sourceName: "camera1",
};
