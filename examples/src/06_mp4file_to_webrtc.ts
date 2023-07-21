import { Norsk, selectAV } from "@norskvideo/norsk-sdk";

export async function main() {
  const fileName = "/mnt/data/TraditionalMusic.mp4";

  const norsk = await Norsk.connect();

  let input = await norsk.input.fileMp4({ id: "fileMp4", sourceName: "example.mp4", fileName, loop: true });
  let output = await norsk.output.whep({ id: "webrtc" });

  output.subscribe([{ source: input, sourceSelector: selectAV }]);

  console.log(`Local player: ${output.playerUrl}`);
}
