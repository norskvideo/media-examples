import {
  AudioGainNode,
  AudioMixSettings,
  AudioSignalGeneratorSettings,
  CmafAudioOutputSettings,
  mkSine,
  Norsk,
  selectAudio,
  audioToPin,
  ChannelLevels
} from "@norskvideo/norsk-sdk"


import { Server, Socket } from "socket.io";
import { createServer } from "http";
import express, { Express, Request, Response } from 'express';

const port = 3000;

let inputGains: Map<string, AudioGainNode> = new Map<string, AudioGainNode>();
let outputGainNode: AudioGainNode;

type channelGain = {
  gain: number[],
  muted: boolean
}
// Keep a list of the possibly connected websockets so gain changes and levels can be broadcast
let clientSocket: Socket[] = [];
let initialGain = { gain: [-12.0, -12.0], muted: false };
let currentGains: channelGain[] = [];

export async function main() {
  const norsk = await Norsk.connect();

  let sourceDefs = [
    { srcName: "ch1", desc: { name: "Src 1", type: "rtmp" }, srcFn: norsk.input.rtmpServer({ id: "rtmpInput1", port: 5001 }) },
    { srcName: "ch2", desc: { name: "Src 2", type: "rtmp" }, srcFn: norsk.input.rtmpServer({ id: "rtmpInput2", port: 5002 }) },
    { srcName: "ch3", desc: { name: "Src 3", type: "rtmp" }, srcFn: norsk.input.rtmpServer({ id: "rtmpInput3", port: 5003 }) },
    { srcName: "ch4", desc: { name: "Src 4", type: "rtmp" }, srcFn: norsk.input.rtmpServer({ id: "rtmpInput4", port: 5004 }) },
  ];

  // Create an input for each source and build a processor chain like this:
  //
  //    audioSignal  ---> audioGain --> audioMeasureLevels
  //
  // ids defined here appear in the visualiser (http://localhost:6791/visualiser/) when this sample is running
  let gains = await Promise.all(sourceDefs.map(async ({ srcName, srcFn }, channel) => {
    let signal = await srcFn;
    let gain = await norsk.processor.transform.audioGain({ id: "gain-" + srcName, channelGains: initialGain.gain });
    let levels = await norsk.processor.control.audioMeasureLevels({ id: "levels-" + srcName, onData: (levels) => clientSocket.forEach(function (s) { sendToClient(s, channel + 1, levels.channelLevels) }) })
    gain.subscribe([{ source: signal, sourceSelector: selectAudio }]);
    levels.subscribe([{ source: gain, sourceSelector: selectAudio }])
    return { srcName, gain: gain };
  }));
  inputGains = gains.reduce((acc, { srcName, gain }) => acc.set(srcName, gain), inputGains);

  // If the gains are unconfigured the mixer gives equal weight to all inputs and tries to
  // output 0dB.  In this case we have independent input gains, so we ask the mixer to
  // use unity gain for each input
  let mixerSettings: AudioMixSettings<"ch1" | "ch2" | "ch3" | "ch4" | "ch5" | "ch6" | "ch7" | "ch8"> = {
    id: "audio-mixer",
    onError: (err: any) => console.log("MIXER ERR", err),
    sampleRate: 48000,
    sources: [
      { pin: "ch1", channelGains: [0, 0] },
      { pin: "ch2", channelGains: [0, 0] },
      { pin: "ch3", channelGains: [0, 0] },
      { pin: "ch4", channelGains: [0, 0] },
      { pin: "ch5", channelGains: [0, 0] },
      { pin: "ch6", channelGains: [0, 0] },
      { pin: "ch7", channelGains: [0, 0] },
      { pin: "ch8", channelGains: [0, 0] }
    ],
    outputSource: "source",
  }

  // Now subscribe the mixer to the gains for each input
  let mixer = await norsk.processor.transform.audioMix(mixerSettings);
  mixer.subscribeToPins(
    Array.from(inputGains).map(function ([srcName, gain]) { return { source: gain, sourceSelector: audioToPin(srcName) } })
  );


  // Define the output nodes
  //
  //  mixer --> output gain -> levels
  //
  outputGainNode = await norsk.processor.transform.audioGain({ id: "output-gain", channelGains: [0, 0] });
  let outputLevels = await norsk.processor.control.audioMeasureLevels({
    id: "output-levels",
    intervalFrames: 5,
    onData: (levels) => clientSocket.forEach(function (s) { sendToClient(s, 0, levels.channelLevels) })
  });
  outputGainNode.subscribe([{ source: mixer, sourceSelector: selectAudio }])
  outputLevels.subscribe([{ source: outputGainNode, sourceSelector: selectAudio }]);

  currentGains.push({ gain: [0.0, 0.0], muted: false });
  sourceDefs.forEach(() => currentGains.push(initialGain));

  // Finally, create an HLS output and subscribe it to the output gain node
  let audioOutput = await norsk.output.cmafAudio(hlsAudioSettings);

  audioOutput.subscribe([{ source: outputGainNode, sourceSelector: selectAudio }]);

  audioOutput.url().then(playlistUrl => {
    console.log(`playlistUrl: ${playlistUrl}`);
  });

  runWebServer(sourceDefs);
}

const hlsAudioSettings: CmafAudioOutputSettings = {
  id: "hls-audio",
  partDurationSeconds: 1.0,
  segmentDurationSeconds: 4.0,
  destinations: [{ type: "local", retentionPeriodSeconds: 60 }],
};


function runWebServer(sourceDefs: { desc: any; }[]) {

  const httpServer = createServer();
  const wsServer = new Server(httpServer, {
    cors: {
      origin: "*"
    }
  });

  httpServer.listen(port, () => {
    console.log(`mixer running on port ${port}.`);
    // console.log(`View the mixer on http://${clientHostExternal()}:${port}/static/audio_mixer.html`);
  });

  wsServer.on("connection", socket => {

    socket.on('error', console.error);
    socket.on('close', () => clientSocket.filter((s) => s != socket));

    clientSocket.push(socket);

    // When a new client connects, send them the current gains & channel definitions.  The levels will be sent
    // next time the various levels nodes generate their output
    let channels = sourceDefs.slice();
    channels.unshift({ desc: { name: "Mixer", type: "output" } });
    socket.emit("channelDefn", JSON.stringify(channels.map(({ desc }, index) => { return { channel: index, desc, gain: currentGains[index] } })));

    socket.on('channelGain', (data) => {
      const message = data.toString();
      let json = JSON.parse(message);
      const ch = json.channel;
      const gain = json.gain;

      // Arbitrarily don't allow gains more than +10dB
      // We could control L & R separately, but for now just set them both to the same value
      if (ch != undefined && gain < 10.0) {
        currentGains[ch].gain = [gain, gain];
        if (!currentGains[ch].muted) {
          if (ch == 0) {
            outputGainNode.updateConfig({ channelGains: [gain, gain] })
          }
          else {
            inputGains.get("ch" + ch)?.updateConfig({ channelGains: [gain, gain] });
          }
        }
      }

      let msg = JSON.stringify({ channel: ch, gain: currentGains[ch] });

      clientSocket.forEach(function (s) {
        if (s.connected) {
          s.emit("channelGain", msg)
        }
      });
    });

    socket.on('channelMuteToggled', (data) => {
      const message = data.toString();
      let json = JSON.parse(message);
      const ch = json.channel;

      if (ch != undefined && ch >= 0 && ch < currentGains.length) {
        currentGains[ch].muted = !currentGains[ch].muted;
        if (!currentGains[ch].muted) {
          if (ch == 0) {
            outputGainNode.updateConfig({ channelGains: [currentGains[ch].gain[0], currentGains[ch].gain[1]] })
          }
          else {
            inputGains.get("ch" + ch)?.updateConfig({ channelGains: [currentGains[ch].gain[0], currentGains[ch].gain[1]] });
          }
        } else {
          if (ch == 0) {
            outputGainNode.updateConfig({ channelGains: [null, null] })
          }
          else {
            inputGains.get("ch" + ch)?.updateConfig({ channelGains: [null, null] });
          }

        }
      }

      let msg = JSON.stringify({ channel: ch, gain: currentGains[ch] });

      clientSocket.forEach(function (s) {
        if (s.connected) {
          s.emit("channelGain", msg)
        }
      });
    });

  });

  return wsServer;
}


function sendToClient(socket: Socket, channel: number, data: ChannelLevels[]) {
  if (socket != null) {
    socket.emit("levels", JSON.stringify({ channel: channel, levels: data }));
  }
}

