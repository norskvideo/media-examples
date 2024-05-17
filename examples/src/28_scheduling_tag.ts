import { AdMarker, CmafDestinationSettings, Norsk, selectAudio, selectPlaylist, selectVideo } from "@norskvideo/norsk-sdk";

import { runWebServer } from './common/webServer';

export async function main() {
  const port = 3210;
  runWebServer(port, { logPlaylists: false });

  const norsk = await Norsk.connect();

  const input = await norsk.input.rtmpServer({ id: "rtmpInput" });

  const localDestination: CmafDestinationSettings = { type: "local", retentionPeriodSeconds: 10, id: "local1" };
  const pushDestination: CmafDestinationSettings = { type: "generic", id: "gen", host: "localhost", port, pathPrefix: "/push/", retentionPeriodSeconds: 60 }
  const destinations: CmafDestinationSettings[] = [
    localDestination,
    pushDestination
  ]

  const segmentSettings = {
    partDurationSeconds: 2.0,
    segmentDurationSeconds: 2.0,
  };

  const audioOutput = await norsk.output.cmafAudio({ id: "audio", destinations, ...segmentSettings });
  const videoOutput = await norsk.output.cmafVideo({ id: "video", destinations, ...segmentSettings });
  const masterOutput = await norsk.output.cmafMultiVariant({ id: "multi-variant", playlistName: "multi-variant", destinations });

  audioOutput.subscribe([{ source: input, sourceSelector: selectAudio }]);
  videoOutput.subscribe([{ source: input, sourceSelector: selectVideo }]);
  masterOutput.subscribe([
    { source: audioOutput, sourceSelector: selectPlaylist },
    { source: videoOutput, sourceSelector: selectPlaylist }
  ]);

  console.log(`Master playlist: ${masterOutput.url}`);
  audioOutput.url().then(logMediaPlaylist("audio"));
  videoOutput.url().then(logMediaPlaylist("video"));

  const scheduledDate = new Date();
  scheduledDate.setSeconds(scheduledDate.getSeconds() + 10)

  // Ad markers will be converted to HLS EXT-X-DATERANGE tags
  const adMarker: AdMarker = {
    id: "10001",
    scte35: {
      sapType: 3,
      protocolVersion: 0,
      encryptedPacket: false,
      encryptionAlgorithm: 0,
      ptsAdjustment: BigInt(0),
      cwIndex: 0,
      tier: 4095,
      spliceCommand: {
        type: "insert",
        value: {
          spliceEventId: 10001,
          spliceEventCancelIndicator: false,
          outOfNetworkIndicator: true,
          spliceImmediateFlag: true,
          mode: { spliceTime: {} },
          breakDuration: { autoReturn: true, duration: BigInt(12 * 90000) },
          uniqueProgramId: 123456,
          availNum: 0,
          availsExpected: 0
        },
      },
      descriptors: []
    },
    durationSeconds: 12,
    startDate: scheduledDate
  }

  audioOutput.scheduleTag(adMarker, scheduledDate)
  videoOutput.scheduleTag(adMarker, scheduledDate)
  // It's also possible to schedule a tag to a specific destination
  videoOutput.scheduleTag({ tag: "# Additional tag for video push" }, scheduledDate, pushDestination.id)

}

function logMediaPlaylist(name: string): (url: string) => void {
  return (
    url => { console.log(`${name} playlistUrl: ${url}`); }
  );
}

