import {
  CmafDestinationSettings,
  CmafOutputSettings,
  Norsk,
  RtmpServerInputNode,
  SrtInputNode,
  StreamMetadata,
  VideoEncodeRung,
  selectAudio,
  selectPlaylist,
  selectVideo,
  videoStreamKeys,
} from "@norskvideo/norsk-sdk";
import { AppRenditions, mkRungs } from "./common/ladder";
import { mkCmafOutputs, mkWhepOutputs } from "./common/mkOutputs";
import * as cpix from "./common/cpix";
import * as ezdrm from "./common/ezDrmCrypto";

const destinations: CmafDestinationSettings[] = [
  { type: "local", retentionPeriodSeconds: 60 },
];
const segmentSettings: CmafOutputSettings = {
  partDurationSeconds: 1.0,
  segmentDurationSeconds: 4.0,
  destinations,
};

export async function main(): Promise<void> {
  if (
    !process.env["EZDRM_TOKEN"] &&
    (!process.env["EZDRM_USERNAME"] || !process.env["EZDRM_PASSWORD"])
  ) {
    const envvar = (k: string) =>
      "$" + k + " " + (process.env[k] ? "\u2713" : "\u2717");
    console.error(
      "Error: This example integration requires these environment variables to be set:\n ",
      `${envvar("EZDRM_TOKEN")}, or ${envvar("EZDRM_USERNAME")} and ${envvar(
        "EZDRM_PASSWORD"
      )}\n `,
      "  From your EZDRM account (see EZDRM's documentation on methods for authentication)\n ",
      `${envvar("EZDRM_WV_PX")} (optional, for playback)\n `,
      "  The last six digits of your Widevine Profile ID\n ",
      `${envvar("EZDRM_PR_PX")} (optional, for playback)\n `,
      "  The last six digits of your PlayReady Profile ID"
    );
    return process.exit(1);
  }

  console.log("For testing use the following configuration:");
  console.log(
    "   DRM > Custom License Server URL:\n ",
    "https://widevine-dash.ezdrm.com/widevine-php/widevine-foreignkey.php?pX=" +
      (process.env["EZDRM_WV_PX"] || "$EZDRM_WV_PX")
  );
  console.log(
    "   OR\n ",
    "https://playready.ezdrm.com/cency/preauth.aspx?pX=" +
      (process.env["EZDRM_PR_PX"] || "$EZDRM_PR_PX")
  );
  console.log();

  const drmResponse = await ezdrm.ezdrmCpix();
  const cryptoDetails = cpix.parseCpix(drmResponse);

  const cmafSettings = { id: "multi-variant", segmentSettings, cryptoDetails };

  const cmafRenditions: AppRenditions = ["low", "medium"];

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
