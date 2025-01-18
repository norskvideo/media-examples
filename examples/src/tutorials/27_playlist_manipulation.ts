import { CmafDestinationSettings, DestinationId, HlsPlaylist, HlsPlaylistAdditions, Norsk, selectAudio, selectPlaylist, selectVideo } from "@norskvideo/norsk-sdk";
import { runWebServer } from '../common/webServer';

export async function main() {
  const port = 3210;
  await runWebServer(port, { logPlaylists: true });

  const norsk = await Norsk.connect();

  const input = await norsk.input.rtmpServer({ id: "rtmpInput" });

  const localDestination: CmafDestinationSettings = { type: "local", retentionPeriodSeconds: 10, id: "local" };
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

  const emptyHlsPlaylist: () => HlsPlaylist = () => {
    return {
      hlsStandardPlaylist: [],
      hlsByteRangePlaylist: [],
      hlsFilePartPlaylist: [],
    }
  }

  const audioPlaylistLocal: HlsPlaylist = emptyHlsPlaylist();
  const audioPlaylistPush: HlsPlaylist = emptyHlsPlaylist();

  audioOutput.onPlaylistAddition = (destinationId: DestinationId, playlistAdditions: HlsPlaylistAdditions): HlsPlaylist => {
    if (destinationId == localDestination.id) {
      audioPlaylistLocal.hlsFilePartPlaylist.push(...playlistAdditions.hlsFilePartPlaylist);
      return audioPlaylistLocal;
    } else {
      audioPlaylistPush.hlsStandardPlaylist.push(...playlistAdditions.hlsStandardPlaylist, { tag: "# Additional comment line for audio push" });
      return audioPlaylistPush;
    }
  }

  const videoPlaylistLocal: HlsPlaylist = emptyHlsPlaylist();
  const videoPlaylistPush: HlsPlaylist = emptyHlsPlaylist();

  videoOutput.onPlaylistAddition = (destinationId: DestinationId, playlistAdditions: HlsPlaylistAdditions): HlsPlaylist => {
    if (destinationId == localDestination.id) {
      videoPlaylistLocal.hlsStandardPlaylist.push(...playlistAdditions.hlsStandardPlaylist);
      videoPlaylistLocal.hlsFilePartPlaylist.push(...playlistAdditions.hlsFilePartPlaylist);
      videoPlaylistLocal.hlsByteRangePlaylist.push(...playlistAdditions.hlsByteRangePlaylist);
      return videoPlaylistLocal;
    } else {
      videoPlaylistPush.hlsStandardPlaylist.push(...playlistAdditions.hlsStandardPlaylist, { tag: "# Additional comment line for video push" });
      return videoPlaylistPush;
    }
  }

  audioOutput.subscribe([{ source: input, sourceSelector: selectAudio }]);
  videoOutput.subscribe([{ source: input, sourceSelector: selectVideo }]);
  masterOutput.subscribe([
    { source: audioOutput, sourceSelector: selectPlaylist },
    { source: videoOutput, sourceSelector: selectPlaylist }
  ]);

  console.log(`Master playlist: ${masterOutput.url}`);
  void audioOutput.url().then(logMediaPlaylist("audio"));
  void videoOutput.url().then(logMediaPlaylist("video"));
}

function logMediaPlaylist(name: string): (url: string) => void {
  return (
    url => { console.log(`${name} playlistUrl: ${url}`); }
  );
}

