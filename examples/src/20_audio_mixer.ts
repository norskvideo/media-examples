import {
  AudioSignalGeneratorSettings,
  AudioGainSettings,
  AudioMixerSettings,
  CmafAudioOutputSettings,
  mkSine,
  Norsk,
  selectAudio,
  audioToPin
} from "@norskvideo/norsk-sdk"

export async function main() {
  const norsk = await Norsk.connect();

  let inputC = await norsk.input.audioSignal(audioSignalSettings("c4", Notes.C4));
  let inputE = await norsk.input.audioSignal(audioSignalSettings("e4", Notes.E4));
  let inputG = await norsk.input.audioSignal(audioSignalSettings("g4", Notes.G4));
  let inputBf = await norsk.input.audioSignal(audioSignalSettings("bf4", Notes.Bf4));

  let inputCGain = await norsk.processor.transform.audioGain({ id: "gain-c4", channelGains: [-15.0, -15.0] });
  inputCGain.subscribe([{ source: inputC, sourceSelector: selectAudio }])
  let inputEGain = await norsk.processor.transform.audioGain({ id: "gain-e4", channelGains: [-15.0, -15.0] });
  inputEGain.subscribe([{ source: inputE, sourceSelector: selectAudio }])
  let inputGGain = await norsk.processor.transform.audioGain({ id: "gain-g4", channelGains: [-15.0, -15.0] });
  inputGGain.subscribe([{ source: inputG, sourceSelector: selectAudio }])
  let inputBfGain = await norsk.processor.transform.audioGain({ id: "gain-bf4", channelGains: [-15.0, -15.0] });
  inputBfGain.subscribe([{ source: inputBf, sourceSelector: selectAudio }])


  let mixerSettings: AudioMixerSettings<"input1" | "input2" | "input3" | "input4"> = {
    id: "audio-mixer",
    onError: (err: any) => console.log("MIXER ERR", err),
    sampleRate: 48000,
    sources: [
      { pin: "input1" },
      { pin: "input2" },
      { pin: "input3" },
      { pin: "input4" }
    ],
    outputSource: "source",
  }

  let mixer = await norsk.processor.transform.audioMixer(mixerSettings);
  mixer.subscribeToPins([
    { source: inputCGain, sourceSelector: audioToPin('input1') },
    { source: inputEGain, sourceSelector: audioToPin('input2') },
    { source: inputGGain, sourceSelector: audioToPin('input3') },
    { source: inputBfGain, sourceSelector: audioToPin('input4') }
  ]);

  let audioOutput = await norsk.output.cmafAudio(hlsAudioSettings);

  audioOutput.subscribe([{ source: mixer, sourceSelector: selectAudio }]);

  audioOutput.url().then(playlistUrl => {
    console.log(`playlistUrl: ${playlistUrl}`);
  });
}


function audioSignalSettings(id: string, note: Notes): AudioSignalGeneratorSettings {
  return {
    id: "audio-signal-" + id,
    sourceName: "signal-" + id,
    channelLayout: "stereo",
    sampleRate: 48000,
    wave: mkSine(note),
  }
}

enum Notes {
  C4 = 261.63,
  D4 = 293.66,
  E4 = 329.63,
  F4 = 349.23,
  G4 = 392.00,
  A4 = 440.00,
  Bf4 = 466.16,
  B4 = 493.88,
  C5 = 523.25
}

const hlsAudioSettings: CmafAudioOutputSettings = {
  id: "hls-audio",
  partDurationSeconds: 1.0,
  segmentDurationSeconds: 4.0,
  destinations: [{ type: "local", retentionPeriodSeconds: 60 }],
};
