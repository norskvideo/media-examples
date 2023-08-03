import { Norsk, selectAV } from "@norskvideo/norsk-sdk";
import { webRtcServerConfig } from "./common/webRtcServerConfig";

export async function main() {
  const fileName = "/mnt/data/TraditionalMusic.mp4";

  const norsk = await Norsk.connect();

  const input = await norsk.input.fileMp4({ id: "fileMp4", sourceName: "example.mp4", fileName, loop: true });
const output = await norsk.output.whep({ id: "webrtc", ...webRtcServerConfig });

  output.subscribe([{ source: input, sourceSelector: selectAV }]);

  console.log(`Local player: ${output.playerUrl}`);
}
