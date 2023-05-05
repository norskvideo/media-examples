import { HlsAudioOutputSettings, HlsMasterOutputSettings, HlsVideoOutputSettings, Norsk, RtmpServerInputSettings, selectAudio, selectAV, selectVideo } from "@id3asnorsk/norsk-sdk";

export async function main() {
  const norsk = await Norsk.connect({});

  let input = await norsk.input.rtmpServer({ id: "rtmpInput", port: 5001 });

  let audioOutput = await norsk.output.hlsAudio(segmentSettings("audio"));
  let videoOutput = await norsk.output.hlsVideo(segmentSettings("video"));
  let masterOutput = await norsk.output.hlsMaster({ id: "master", playlistName: "master" });

  audioOutput.subscribe([{ source: input, sourceSelector: selectAudio }]);
  videoOutput.subscribe([{ source: input, sourceSelector: selectVideo }]);
  masterOutput.subscribe([{ source: input, sourceSelector: selectAV }]);

  console.log(`Master playlist: ${masterOutput.playlistUrl}`);
  audioOutput.url().then(logMediaPlaylist("audio"));
  videoOutput.url().then(logMediaPlaylist("video"));
}

function segmentSettings(id: string) {
  return {
    id: id,
    partDurationSeconds: 1.0,
    segmentDurationSeconds: 4.0,
  };
}

function logMediaPlaylist(name: string) : (url: string) => void {
  return (
    url => { console.log(`${name} playlistUrl: ${url}`); }
  );
}
