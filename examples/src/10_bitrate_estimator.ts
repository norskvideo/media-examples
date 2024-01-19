import {
  CmafDestinationSettings,
  Norsk,
  SrtInputSettings,
  selectAudio,
  selectAV,
  selectVideo,
  selectPlaylist,
} from "@norskvideo/norsk-sdk";

export async function main() {
  const srtSettings: SrtInputSettings = {
    id: "srtInput",
    ip: "0.0.0.0",
    port: 5001,
    mode: "listener",
    sourceName: "srtInput",
  };

  const norsk = await Norsk.connect({
    onShutdown: () => {
      console.log("Norsk has shutdown");
      process.exit(1)
    }
  });

  // SRT inputs do not have bitrate information, which is required for HLS
  // multi variant playlists.
  //
  // AAC audio does not need a transcode in this setting, and without a
  // transcode (implicit or explicit), there is no bitrate information added.
  const srtAacInput = await norsk.input.srt(srtSettings);

  // So we sample the stream for 10 seconds to estimate its bitrate and add this
  // bitrate to the stream's metadata before subscribing the multi variant playlist to
  // the stream.
  let streamStarted = false;
  const streamStatistics = await norsk.processor.control.streamStatistics({
    id: "inputStreamStatistics",
    statsSampling: {
      // 1s for visualiser updates
      // 5s for console updates
      // 10s for stream bitrate estimation
      sampleIntervalsSeconds: [1, 5, 10],
    },
    onStreamStatistics: async stats => {
      const { audio, video } = stats;
      if (stats.sampleSizeSeconds === 10) {
        if (streamStarted) return;
        streamStarted = true;
        console.log(`+ audio: ${(audio.bitrate / 1000).toFixed(1)}kbps`)
        console.log(`+ video: ${(video.bitrate / 1000).toFixed(1)}kbps`);

        // Use NorskTransform.streamMetadataOverride to add bitrate information
        // to the video and audio streams
        streamMetadataOverride.updateConfig({
          video: {
            bitrate: video.bitrate,
          },
          audio: {
            bitrate: audio.bitrate,
          }
        });

        // And subscribe the multi variant playlist, now that the stream has bitrate
        // metadata
        multiVariantOutput.subscribe([
          { source: streamMetadataOverride, sourceSelector: selectPlaylist },
        ]);
      } else if (stats.sampleSizeSeconds === 5 && streamStarted) {
        console.log(`  audio: ${(audio.bitrate / 1000).toFixed(1)}kbps`)
        console.log(`  video: ${(video.bitrate / 1000).toFixed(1)}kbps`);
      }
    },
  });
  streamStatistics.subscribe([
    { source: srtAacInput, sourceSelector: selectAV },
  ]);

  const streamMetadataOverride = await norsk.processor.transform.streamMetadataOverride({
    id: "setBitrate",
  });
  streamMetadataOverride.subscribe([
    { source: srtAacInput, sourceSelector: selectAV },
  ]);

  const destinations: CmafDestinationSettings[] = [{ type: "local", retentionPeriodSeconds: 10, id: "local" }]

  const multiVariantPlaylistSettings = { id: "multi-variant", playlistName: "multi-variant", destinations };
  const audio = {
    id: "audio",
    partDurationSeconds: 1.0,
    segmentDurationSeconds: 4.0,
    destinations,
  };
  const high = {
    id: "high",
    partDurationSeconds: 1.0,
    segmentDurationSeconds: 4.0,
    destinations,
  };

  const multiVariantOutput = await norsk.output.cmafMultiVariant(multiVariantPlaylistSettings);
  const audioOutput = await norsk.output.cmafAudio(audio);
  const highOutput = await norsk.output.cmafVideo(high);

  highOutput.subscribe([
    { source: streamMetadataOverride, sourceSelector: selectVideo },
  ]);
  audioOutput.subscribe([
    { source: streamMetadataOverride, sourceSelector: selectAudio },
  ]);
  multiVariantOutput.subscribe([
    { source: audioOutput, sourceSelector: selectPlaylist },
    { source: highOutput, sourceSelector: selectPlaylist }
  ])

  console.log(`HLS Multi Variant Playlist: ${multiVariantOutput.url}`);
}

