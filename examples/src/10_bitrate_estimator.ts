import {
  BrowserInputSettings,
  CMAFDestinationSettings,
  ComposePart,
  VideoComposeSettings,
  Norsk,
  selectAllVideos,
  selectAudio,
  selectAV,
  selectVideo,
  SrtInputSettings,
  StreamMetadata,
  VideoEncodeRung,
  videoStreamKeys,
  videoToPin,
} from "@norskvideo/norsk-sdk";

export async function main() {
  const srtSettings: SrtInputSettings = {
    id: "srtInput",
    ip: "127.0.0.1",
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
  // master playlists.
  //
  // AAC audio does not need a transcode in this setting, and without a
  // transcode (implicit or explicit), there is no bitrate information added.
  let srtAacInput = await norsk.input.srt(srtSettings);

  // So we sample the stream for 10 seconds to estimate its bitrate and add this
  // bitrate to the stream's metadata before subscribing the master playlist to
  // the stream.
  let streamStarted = false;
  let streamStatistics = await norsk.processor.control.streamStatistics({
    id: "inputStreamStatistics",
    statsSampling: {
      // 1s for visualiser updates
      // 5s for console updates
      // 10s for stream bitrate estimation
      sampleIntervalsSeconds: [1, 5, 10],
    },
    onStreamStatistics: async stats => {
      let { audio, video } = stats;
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

        // And subscribe the master playlist, now that the stream has bitrate
        // metadata
        masterOutput.subscribe([
          { source: streamMetadataOverride, sourceSelector: selectAV },
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

  let streamMetadataOverride = await norsk.processor.transform.streamMetadataOverride({
    id: "setBitrate",
  });
  streamMetadataOverride.subscribe([
    { source: srtAacInput, sourceSelector: selectAV },
  ]);

  let destinations: CMAFDestinationSettings[] = [{ type: "local", retentionPeriodSeconds: 10 }]

  let masterPlaylistSettings = { id: "master", playlistName: "master", destinations };
  let audio = {
    id: "audio",
    partDurationSeconds: 1.0,
    segmentDurationSeconds: 4.0,
    destinations,
  };
  let high = {
    id: "high",
    partDurationSeconds: 1.0,
    segmentDurationSeconds: 4.0,
    destinations,
  };

  let masterOutput = await norsk.output.cmafMaster(masterPlaylistSettings);
  let audioOutput = await norsk.output.cmafAudio(audio);
  let highOutput = await norsk.output.cmafVideo(high);

  highOutput.subscribe([
    { source: streamMetadataOverride, sourceSelector: selectVideo },
  ]);
  audioOutput.subscribe([
    { source: streamMetadataOverride, sourceSelector: selectAudio },
  ]);

  console.log(`Local player: ${masterOutput.playlistUrl}`);
}

