import { Norsk, selectAudio, selectAV, selectVideo } from "@norskvideo/norsk-sdk";

export async function main() {
  const norsk = await Norsk.connect();  

  let input = await norsk.input.rtmpServer({ id: "rtmpInput" }); 
  let output = await norsk.duplex.webRtcBrowser({ id: "webrtc" }); 

  output.subscribe([{ source: input, sourceSelector: selectAV }]); 
  console.log(`Local player: ${output.playerUrl}`);
}
