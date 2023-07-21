import { Norsk, SrtInputSettings, StreamMetadata, WebRTCBrowserSettings, WhepOutputSettings, requireAV, selectAV } from "@norskvideo/norsk-sdk"

export async function main() {
  const norsk = await Norsk.connect();

  let input = await norsk.input.srt(srtInputSettings);
  let output = await norsk.output.whep(whepOutputSettings);

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
const whepOutputSettings: WhepOutputSettings = {
  id: "webrtc",
  ...iceServerConfig
};
function iceServerConfig(): WhepOutputSettings {
  return (process.env.TURN_INTERNAL && process.env.TURN_EXTERNAL) ?
    // Separate hostnames for server and client access to the turn server as in some cases they cannot resolve the same IP
    {
      iceServers: [{ urls: [`turn:${process.env.TURN_INTERNAL}:3478`], username: "norsk", credential: "norsk" }],
      reportedIceServers: [{ urls: [`turn:${process.env.TURN_EXTERNAL}:3478`], username: "norsk", credential: "norsk" }]
    }
    :
    { iceServers: [] };
}
