import { Norsk, selectAV } from "@norskvideo/norsk-sdk";
import fs from "fs/promises";

export async function main() {
  const fileName = await fs.realpath("./data/mp4_h264_fragmented.mp4");

  const norsk = await Norsk.connect();

  let input = await norsk.input.localMp4File({ id: "mp4File", sourceName: "example.mp4", fileName: fileName });
  let output = await norsk.duplex.localWebRTC({ id: "webrtc" });

  output.subscribe([{ source: input, sourceSelector: selectAV }]);

  console.log(`Local player: ${output.playerUrl}`);
}
