import {
  AudioMatrixMixerSettings,
  AudioMatrixMixerSettingsUpdate,
  Gain,
  HlsAudioOutputSettings,
  Norsk,
  RtpInputSettings,
  selectAudio,
} from "@id3asnorsk/norsk-sdk";

// Matrix mixer, downmix a 5.1 layout to stereo
export async function main() {
  const norsk = await Norsk.connect({});

  let input = await norsk.input.rtp(rtpInputSettings);
  let matrixMixer = await norsk.processor.transform.audioMatrixMixer(initialMixerSettings);
  let audioOutput = await norsk.output.hlsAudio(hlsAudioSettings);

  matrixMixer.subscribe([{ source: input, sourceSelector: selectAudio }]);
  audioOutput.subscribe([{ source: matrixMixer, sourceSelector: selectAudio }]);

  audioOutput.url().then(playlistUrl => {
    console.log(`playlistUrl: ${playlistUrl}`);
  });

  // Update gains every 3s
  let wasPreviousA = true;
  setInterval(function () {
    let newMixerConfig: AudioMatrixMixerSettingsUpdate;
    if (wasPreviousA) {
      newMixerConfig = { channelGains: mixB };
      wasPreviousA = false;
    } else {
      newMixerConfig = { channelGains: mixA };
      wasPreviousA = true;
    }
    console.log("Apply mixer config:", newMixerConfig);
    matrixMixer.updateConfig(newMixerConfig);
  }, 3000);
}

const mixA: Gain[][] = [
  [0.0, null, -6.0, null, -9.0, null],
  [null, 0.0, null, -6.0, null, -9.0],
];

const mixB: Gain[][] = [
  [null, 0.0, null, -6.0, null, -9.0],
  [0.0, null, -6.0, null, -9.0, null],
];

const initialMixerSettings: AudioMatrixMixerSettings = {
  id: "mixer",
  outputChannelLayout: "stereo",
  channelGains: mixA,
};

const hlsAudioSettings: HlsAudioOutputSettings = {
  id: "hls-audio",
  partDurationSeconds: 1.0,
  segmentDurationSeconds: 4.0,
};

const rtpInputSettings: RtpInputSettings = {
  id: "rtp",
  onError: (err) => console.log("RTP INGEST ERR", err),
  sourceName: "rtp1",
  streams: [
    {
      ip: "127.0.0.1",
      rtpPort: 5001,
      rtcpPort: 5002,
      iface: "any",
      streamId: 1,
      streamType: {
        kind: "linearpcm",
        bitDepth: 24,
        sampleRate: 48000,
        channelLayout: "5.1",
      },
    },
  ],
};
