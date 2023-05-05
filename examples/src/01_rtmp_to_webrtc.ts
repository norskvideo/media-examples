import { Norsk, selectAudio, selectAV, selectVideo } from "@id3asnorsk/norsk-sdk";

export async function main() {
  const norsk = await Norsk.connect({});  

  let input = await norsk.input.rtmpServer({ id: "rtmpInput", port: 5001 }); 
  let output = await norsk.duplex.localWebRTC({ id: "localRtcOutput" }); 

  output.subscribe([{ source: input, sourceSelector: selectAV }]); 
  console.log(`Local player: ${output.playerUrl}`);
}
