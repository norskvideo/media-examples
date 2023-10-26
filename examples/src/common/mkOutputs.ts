import {
  CmafOutputSettings,
  CmafVideoOutputNode,
  selectPlaylist,
  WhepOutputNode,
  Norsk,
  selectAudio,
  SourceMediaNode,
  StreamKey,
  StreamMetadata,
  VideoEncodeNode,
  videoStreamKeys,
  WhepOutputSettings,
} from "@norskvideo/norsk-sdk";
import { CryptoDetails } from "./cpix";


export function videoRendition(desiredRendition: string): (streams: StreamMetadata[]) => StreamKey[] {
  return (streams: StreamMetadata[]) => {
    return videoStreamKeys(streams).filter((k) => k.renditionName == desiredRendition);
  }
}

export async function mkCmafOutputs<T extends string>(
  norsk: Norsk,
  cmafSettings: {
    id: string,
    segmentSettings: CmafOutputSettings,
    cryptoDetails?: CryptoDetails,
  },
  sources: {
    videoLadder: VideoEncodeNode,
    audio: SourceMediaNode,
  },
  renditions: readonly T[]) {
  const crypto = cmafSettings.cryptoDetails;

  const audioCryptoSettings = crypto ? {
    encryption: crypto.audio,
    m3uAdditions: crypto.audio.mediaSignaling,
    mpdAdditions: crypto.audio.dashSignalling,
  } : {};

  const videoCryptoSettings = crypto ? {
    encryption: crypto.video,
    m3uAdditions: crypto.video.mediaSignaling,
    mpdAdditions: crypto.video.dashSignalling,
  } : {};
  const mvCryptoSettings = crypto ? {
    m3uAdditions: [
      crypto.audio.multivariantSignaling,
      crypto.video.multivariantSignaling,
    ].join("\n"),
    mpdAdditions: "",
  } : {};

  const multiVariantOutput = await norsk.output.cmafMultiVariant({
    id: cmafSettings.id,
    playlistName: cmafSettings.id,
    destinations: cmafSettings.segmentSettings.destinations,
    ...mvCryptoSettings,
  });

  const mkCmafVideoOutput = async (name: T) => {
    const output = await norsk.output.cmafVideo({
      id: cmafSettings.id + "-" + name,
      ...cmafSettings.segmentSettings,
      ...videoCryptoSettings,
    });
    output.subscribe([{ source: sources.videoLadder, sourceSelector: videoRendition(name) }]);
    return { name, output };
  };

  const namedCmafOutputs = await Promise.all(renditions.map(mkCmafVideoOutput));

  const audioOutput = await norsk.output.cmafAudio({
    id: cmafSettings.id + "-" + "audio",
    ...cmafSettings.segmentSettings,
    ...audioCryptoSettings,
  });

  audioOutput.subscribe([{ source: sources.audio, sourceSelector: selectAudio }]);
  multiVariantOutput.subscribe([
    ...namedCmafOutputs.map(({ output }) => { return { source: output, sourceSelector: selectPlaylist } }),
    { source: audioOutput, sourceSelector: selectPlaylist },
  ]);

  const cmafObject =
    namedCmafOutputs.reduce((a, v) => ({ ...a, [v.name]: v.output }), {}) as Record<T, CmafVideoOutputNode>

  return {
    multivariant: multiVariantOutput,
    videos: cmafObject,
    audio: audioOutput,
  }
}

export async function mkWhepOutputs<T extends string>(
  norsk: Norsk,
  whepSettings: {
    idRoot: string,
    webRtcServerConfig?: Omit<WhepOutputSettings, "id">
  },
  sources: {
    videoLadder: VideoEncodeNode,
    audio: SourceMediaNode,
  },
  cmafRenditions: readonly T[]) {

  const webRtcServerConfig = whepSettings.webRtcServerConfig ?? {};

  const mkWhepOutput = async (name: T) => {
    const output = await norsk.output.whep({ id: whepSettings.idRoot + "-" + name, ...webRtcServerConfig });
    output.subscribe([
      { source: sources.videoLadder, sourceSelector: videoRendition(name) },
      { source: sources.audio, sourceSelector: selectAudio },
    ]);
    return { name, output };
  };

  const namedWhepOutputs = await Promise.all(cmafRenditions.map(mkWhepOutput));

  const whepObject =
    namedWhepOutputs.reduce((a, v) => ({ ...a, [v.name]: v.output }), {}) as Record<T, WhepOutputNode>

  return whepObject;
}


