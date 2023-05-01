import { Norsk, StreamMetadataMessage, selectAV } from "@id3asnorsk/norsk-sdk"

export async function main() {
  const norsk = await Norsk.connect({
    onShutdown: () => {
      console.log("Norsk has shutdown");
      process.exit(1)
    }
  });


  let input = await norsk.input.rtmpServer({ id: "rtmpInput", port: 5001 });

  let sampleIntervalSeconds = 5;
  let input_stats = await norsk.processor.control.streamStats({
    id: "inputStreamStats",
    onStreamStats: ({ audio, video, total, allStreams }) => {
      // Stats can be found for each stream individually by stream key
      console.log(`${allStreams.length} streams:`);
      // And aggregated information for audio, video, and total is available
      console.log(`  audio: ${(audio.bitrate/1000).toFixed(1)}kbps`)
      console.log(`  video: ${(video.bitrate/1000).toFixed(1)}kbps`);
    },
    statsSampling: { sampleIntervalsSeconds: [sampleIntervalSeconds] },
  });
  input_stats.subscribe([{ source: input, sourceSelector: selectAV }]);
}
