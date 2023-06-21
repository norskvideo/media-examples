import { Norsk, selectAV } from "@norskvideo/norsk-sdk";

export async function main() {
  const norsk = await Norsk.connect();  

  let input = await norsk.input.rtmpServer({ id: "rtmpInput" }); 
  let output = await norsk.output.whep({ id: "webrtc" }); 

  output.subscribe([{ source: input, sourceSelector: selectAV }]); 
  console.log(`Local player: ${output.playerUrl}`);
}
