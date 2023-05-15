import {
  audioStreamKeys,
  CMAFDestinationSettings,
  CmafMasterOutputNode,
  CmafMasterOutputSettings,
  LocalWebRTCNode,
  Norsk,
  RtmpServerInputNode,
  StreamMetadata,
  videoStreamKeys,
} from "@norskvideo/norsk-sdk";

let allowedRenditions = {
  high: { bitrate: 800000 },
  medium: { bitrate: 500000 },
  low: { bitrate: 250000 },
};

let selectAVFromAllowed = (
  app: string,
  publishingName: string,
  streams: StreamMetadata[]
) => {
  const audio = audioStreamKeys(streams).filter(
    (k) => k.sourceName === app && k.renditionName === publishingName
  );
  const video = videoStreamKeys(streams).filter(
    (k) => k.sourceName === app && k.renditionName === publishingName
  );
  if (audio.length == 1 && video.length == 1) {
    return audio.concat(video);
  }
  return [];
};

let selectVideoFromAllowed = (
  app: string,
  publishingName: string,
  streams: StreamMetadata[]
) => {
  const video = videoStreamKeys(streams).filter(
    (k) => k.sourceName === app && k.renditionName === publishingName
  );
  if (video.length == 1) {
    return video;
  }
  return [];
};

let selectAudioFromAllowed = (
  app: string,
  publishingName: string,
  streams: StreamMetadata[]
) => {
  const audio = audioStreamKeys(streams).filter(
    (k) => k.sourceName === app && k.renditionName === publishingName
  );
  if (audio.length == 1) {
    return audio;
  }
  return [];
};

let subscribeAV = (
  source: RtmpServerInputNode,
  app: string,
  publishingName: string
) => {
  return {
    source,
    sourceSelector: (streams: StreamMetadata[]) =>
      selectAVFromAllowed(app, publishingName, streams),
  };
};

let subscribeVideo = (
  source: RtmpServerInputNode,
  app: string,
  publishingName: string
) => {
  return {
    source,
    sourceSelector: (streams: StreamMetadata[]) =>
      selectVideoFromAllowed(app, publishingName, streams),
  };
};

let subscribeAudio = (
  source: RtmpServerInputNode,
  app: string,
  publishingName: string
) => {
  return {
    source,
    sourceSelector: (streams: StreamMetadata[]) =>
      selectAudioFromAllowed(app, publishingName, streams),
  };
};

type App = {
  master: CmafMasterOutputNode;
  webrtc: LocalWebRTCNode[];
  sources: string[];
};
let knownApps: { [x: string]: App } = {};

let partDurationSeconds = 1.0;
let segmentDurationSeconds = 4.0;

export async function main() {
  const norsk = await Norsk.connect();

  let input = await norsk.input.rtmpServer({
    id: "rtmp",
    port: 5001,

    onConnection: (app: string, url: string) => {
      console.log("Got RTMP connection", app, url);
      return { accept: true }; // accept all!!!
    },

    onStream: (
      app: string,
      url: string,
      streamId: number,
      publishingName: string
    ) => {
      if (!(publishingName in allowedRenditions)) {
        return {
          accept: false,
          reason: "only known rendition names are accepted around here",
        };
      }

      console.log("Got RTMP stream", app, url, streamId, publishingName);
      let onStream = async () => {
        const destinations: CMAFDestinationSettings[] = [{ type: "local", retentionPeriodSeconds: 10 }]
        // Register this app if we've not seen it before, and start up a master playlist for it
        if (!knownApps[app]) {
          let settings: CmafMasterOutputSettings = {
            id: "hls-master-" + app,
            playlistName: app,
            destinations,
          };
          let masterPlaylist = await norsk.output.cmafMaster(settings);
          knownApps[app] = { master: masterPlaylist, sources: [], webrtc: [] };
          console.log(`Local player: ${masterPlaylist.playlistUrl}`);
        }
        // Create a single WebRTC output for this new stream
        let webRtcOutput = await norsk.duplex.localWebRTC({
          id: "webrtc-" + app + "-" + publishingName,
        });
        webRtcOutput.subscribe([subscribeAV(input, app, publishingName)]);
        knownApps[app].webrtc.push(webRtcOutput);
        console.log(`Local player: ${webRtcOutput.playerUrl}`);

        // Create a single audio HLS output for this new stream
        let audioOutput = await norsk.output.cmafAudio({
          id: "hls-" + app + "-" + publishingName + "-audio",
          partDurationSeconds,
          segmentDurationSeconds,
          destinations
        });
        audioOutput.subscribe([subscribeAudio(input, app, publishingName)]);

        // Create a single video HLS output for this new stream
        let videoOutput = await norsk.output.cmafVideo({
          id: "hls-" + app + "-" + publishingName + "-video",
          partDurationSeconds,
          segmentDurationSeconds,
          destinations,
        });
        videoOutput.subscribe([subscribeVideo(input, app, publishingName)]);

        // Add this to the list of renditions we know about
        knownApps[app].sources.push(publishingName);

        // And re-subscribe the master playlist to all of the known about renditions
        knownApps[app].master.subscribe(
          knownApps[app].sources.map((r) => subscribeAV(input, app, r))
        );
      };
      onStream();

      return {
        accept: true,
        // These are in fact the defaults
        audioStreamKey: {
          programNumber: 1,
          streamId: 1,
          sourceName: app,
          renditionName: publishingName,
        },
        videoStreamKey: {
          programNumber: 1,
          streamId: 2,
          sourceName: app,
          renditionName: publishingName,
        },
      };
    },
  });
}
