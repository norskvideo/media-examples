import { Norsk, selectAV } from "@norskvideo/norsk-sdk";
import { webRtcServerConfig } from "../common/webRtcServerConfig";

export async function main() {
  const norsk = await Norsk.connect();  

  const input = await norsk.input.rtmpServer({ id: "rtmpInput" }); 
  const output = await norsk.output.whep({ id: "webrtc", ...webRtcServerConfig }); 

  output.subscribe([{ source: input, sourceSelector: selectAV }]); 
  console.log(`WebRTC Player URL: ${output.playerUrl}`);
}
