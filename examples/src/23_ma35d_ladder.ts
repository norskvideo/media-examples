import { CmafOutputSettings, Norsk, selectVideo } from "@norskvideo/norsk-sdk";
import { webRtcServerConfig } from "./common/webRtcServerConfig";
import { AppRenditions, mkRungs } from "./common/ladder";
import { mkCmafOutputs, mkWhepOutputs } from "./common/mkOutputs";

const segmentSettings: CmafOutputSettings = {
  partDurationSeconds: 1.0,
  segmentDurationSeconds: 4.0,
  destinations: [{ type: "local", retentionPeriodSeconds: 60, id: "local" }],
};
const cmafSettings = { id: "multi-variant", segmentSettings };
const whepSettings = { idRoot: "whepRoot", webRtcServerConfig };

export async function main(): Promise<void> {
  const cmafRenditions: AppRenditions = ["low", "medium", "high", "hevc"];
  const whepRenditions: AppRenditions = ["LL-preview"];

  // Use set to dedupe any common renditions
  const allRenditions: AppRenditions = [
    ...new Set([...cmafRenditions, ...whepRenditions]),
  ];

  const norsk = await Norsk.connect({ onAmdMA35DLoad: (load) => {
    // console.log("HERE", load)
  }});

  const input = await norsk.input.rtmpServer({ id: "rtmp" });

  const abrLadder = await norsk.processor.transform.videoEncode({
    id: "ladder",
    rungs: mkRungs(allRenditions, "ma35d"),
  });
  const sources = { videoLadder: abrLadder, audio: input };
  const cmafOutputs = await mkCmafOutputs(
    norsk,
    cmafSettings,
    sources,
    cmafRenditions
  );
  const whepOutputs = await mkWhepOutputs(
    norsk,
    whepSettings,
    sources,
    whepRenditions
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

  whepRenditions.forEach((k) => {
    console.log(`WebRTC PlayerUrl ${k}: ${whepOutputs[k].playerUrl}`);
  });
}

