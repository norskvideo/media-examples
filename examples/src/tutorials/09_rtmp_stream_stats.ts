import { Norsk, selectAV } from "@norskvideo/norsk-sdk"

export async function main() {
  const norsk = await Norsk.connect({});

  const input = await norsk.input.rtmpServer({ id: "rtmpInput" });

  const sampleIntervalSeconds = 5;
  const input_stats = await norsk.processor.control.streamStatistics({
    id: "inputStreamStatistics",
    onStreamStatistics: ({ audio, video, total, allStreams }) => {
      // Stats can be found for each stream individually by stream key
      console.log(`${allStreams.length} streams:`);
      // And aggregated information for audio, video, and total is available
      console.log(`  audio: ${(audio.bitrate / 1000).toFixed(1)}kbps`);
      console.log(`  video: ${(video.bitrate / 1000).toFixed(1)}kbps`);
      console.log(`  total: ${(total.bitrate / 1000).toFixed(1)}kbps`);
    },
    statsSampling: { sampleIntervalsSeconds: [sampleIntervalSeconds] },
  });
  input_stats.subscribe([{ source: input, sourceSelector: selectAV }]);
}
