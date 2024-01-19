import {
  CmafDestinationSettings,
  CmafOutputSettings,
  Norsk,
  selectVideo,
} from "@norskvideo/norsk-sdk";
import { AppRenditions, mkRungs } from "./common/ladder";
import { mkCmafOutputs } from "./common/mkOutputs";
import * as cpix from "./common/cpix";
import * as axinom from "./common/axinom";

const destinations: CmafDestinationSettings[] = [
  { type: "local", retentionPeriodSeconds: 60, id: "local" },
];
const segmentSettings: CmafOutputSettings = {
  partDurationSeconds: 1.0,
  segmentDurationSeconds: 4.0,
  destinations,
};

export async function main(): Promise<void> {
  const seed: cpix.AVKeyIds = {
    audio: "216a1281-c95a-488f-9b5c-0d4f6066e04d",
    video: "957f2917-e9ad-41fd-b6d6-0e304170342b",
  };

  axinom.checkEnv(seed);
  const drmResponse = await axinom.axinomCpix(seed);

  const cryptoDetails = cpix.parseCpix(drmResponse);
  const cmafSettings = { id: "multi-variant", segmentSettings, cryptoDetails };

  const cmafRenditions: AppRenditions = ["low", "medium"]; // ["high", "medium", "low"]  ;

  const norsk = await Norsk.connect();
  const input = await norsk.input.rtmpServer({ id: "rtmp" });

  const abrLadder = await norsk.processor.transform.videoEncode({
    id: "ladder",
    rungs: mkRungs(cmafRenditions),
  });
  const sources = { videoLadder: abrLadder, audio: input };
  const cmafOutputs = await mkCmafOutputs(
    norsk,
    cmafSettings,
    sources,
    cmafRenditions
  );

  abrLadder.subscribe([{ source: input, sourceSelector: selectVideo }]);

  console.log(`Multi variant playlist: ${cmafOutputs.multivariant.url}`);
  cmafRenditions.forEach((k) => {
    cmafOutputs.videos[k]
      .url()
      .then((url) => console.log(`HLS ${k} Playlist: ${url}`));
  });
  cmafOutputs.audio
    .url()
    .then((url) => console.log(`HLS Audio Playlist: ${url}`));
}
