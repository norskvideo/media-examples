import { Norsk, WhepOutputSettings, selectAV } from "@norskvideo/norsk-sdk";

export async function main() {
  const norsk = await Norsk.connect();  

  let input = await norsk.input.rtmpServer({ id: "rtmpInput" }); 
  let output = await norsk.output.whep({ id: "webrtc", ...iceServerConfig }); 

  output.subscribe([{ source: input, sourceSelector: selectAV }]); 
  console.log(`Local player: ${output.playerUrl}`);
}

const iceServerConfig: WhepOutputSettings = (process.env.TURN_INTERNAL && process.env.TURN_EXTERNAL) ?
  // Separate hostnames for server and client access to the turn server as in some cases they cannot resolve the same IP
  { iceServers: [ { urls: [`turn:${process.env.TURN_INTERNAL}:3478`], username: "norsk", credential: "norsk" } ],
    reportedIceServers: [ { urls: [`turn:${process.env.TURN_EXTERNAL}:3478`], username: "norsk", credential: "norsk" } ]
  }
  :
  { iceServers: [] };
