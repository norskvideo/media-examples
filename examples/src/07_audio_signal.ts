import { AudioSignalGeneratorSettings, CmafAudioOutputSettings, mkSine, Norsk, selectAudio } from "@norskvideo/norsk-sdk"

export async function main() {
  const norsk = await Norsk.connect();

  let input = await norsk.input.audioSignal(audioSignalSettings);
  let audioOutput = await norsk.output.cmafAudio(hlsAudioSettings);

  audioOutput.subscribe([{ source: input, sourceSelector: selectAudio }]);

  audioOutput.url().then(playlistUrl => {
    console.log(`playlistUrl: ${playlistUrl}`);
  });
}

const audioSignalSettings: AudioSignalGeneratorSettings = {
  id: "audio-signal",
  sourceName: "signal",
  channelLayout: "stereo",
  sampleRate: 48000,
  wave: mkSine(440),
};

const hlsAudioSettings: CmafAudioOutputSettings = {
  id: "hls-audio",
  partDurationSeconds: 1.0,
  segmentDurationSeconds: 4.0,
  destinations: [{ type: "local", retentionPeriodSeconds: 60 }],
};
