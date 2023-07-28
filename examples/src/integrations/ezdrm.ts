import {
  CmafDestinationSettings,
  Norsk,
  selectAudio,
  selectAV,
  selectVideo,
} from "@norskvideo/norsk-sdk";
import { randomUUID } from "crypto";
import { XMLParser } from "fast-xml-parser";

export async function main() {
  console.log();
  if (!process.env["EZDRM_TOKEN"] && (!process.env["EZDRM_USERNAME"] || !process.env["EZDRM_PASSWORD"])) {
    let envvar = (k: string) => "$" + k + " " + (process.env[k] ? "\u2713" : "\u2717");
    console.error(
      "Error: This example integration requires these environment variables to be set:\n ",
      `${envvar("EZDRM_TOKEN")}, or ${envvar("EZDRM_USERNAME")} and ${envvar("EZDRM_PASSWORD")}\n `,
      "  From your EZDRM account (see EZDRM's documentation on methods for authentication)\n ",
      `${envvar("EZDRM_WV_PX")} (optional, for playback)\n `,
      "  The last six digits of your Widevine Profile ID\n ",
      `${envvar("EZDRM_PR_PX")} (optional, for playback)\n `,
      "  The last six digits of your PlayReady Profile ID"
    );
    return process.exit(1);
  }
  console.log("For testing Widevine/PlayReady playback with Shaka player, use the following configuration:");
  console.log("  https://shaka-player-demo.appspot.com/demo/");
  console.log("    NOTE: Your browser will need to consider Norsk secure for Shaka player to be able to play it, so either allow insecure content/disable CORS in your web browser, or add a HTTPS reverse proxy in front of the Norsk endpoint given below");
  console.log();
  console.log("DRM > Custom License Server URL:\n ", "https://widevine-dash.ezdrm.com/widevine-php/widevine-foreignkey.php?pX="+(process.env["EZDRM_WV_PX"] || "$EZDRM_WV_PX"));
  console.log("    OR\n ", "https://playready.ezdrm.com/cency/preauth.aspx?pX="+(process.env["EZDRM_PR_PX"] || "$EZDRM_PR_PX"));
  console.log("EXTRA CONFIG:\n ", JSON.stringify({
    "streaming": {
      "lowLatencyMode": true,
      "inaccurateManifestTolerance": 0,
      "rebufferingGoal": 0.01
    }
  }));

  const norsk = await Norsk.connect();

  let input = await norsk.input.rtmpServer({ id: "rtmpInput" });
  let destinations: CmafDestinationSettings[] = [{ type: "local", retentionPeriodSeconds: 10 }];

  // Client generates the key IDs
  // For production, you should use randomUUID()
  let audioEncryptionKeyId = randomUUID();
  let videoEncryptionKeyId = randomUUID();
  let { audio: audioEncryption, video: videoEncryption } = await obtainKey({
    audio: audioEncryptionKeyId,
    video: videoEncryptionKeyId
  });

  let fileOutput = await norsk.output.fileMp4({
    id: "file",
    fragmentedFileName: "/mnt/output/encrypted.mp4",
    audioEncryption,
    videoEncryption,
  });

  let audioOutput = await norsk.output.cmafAudio({
    id: "audio",
    destinations,
    encryption: audioEncryption,
    ...segmentSettings,
    m3uAdditions: audioEncryption.mediaSignaling,
    mpdAdditions: audioEncryption.contentProtection,
  });
  let videoOutput = await norsk.output.cmafVideo({
    id: "video",
    destinations,
    encryption: videoEncryption,
    ...segmentSettings,
    m3uAdditions: videoEncryption.mediaSignaling,
    mpdAdditions: videoEncryption.contentProtection,
  });
  let masterOutput = await norsk.output.cmafMaster({
    id: "master",
    playlistName: "master",
    destinations,
    m3uAdditions: [
      audioEncryption.masterSignaling,
      videoEncryption.masterSignaling,
    ].join("\n"),
    mpdAdditions: "",
  });

  fileOutput.subscribe([{ source: input, sourceSelector: selectAV }]);
  audioOutput.subscribe([{ source: input, sourceSelector: selectAudio }]);
  videoOutput.subscribe([{ source: input, sourceSelector: selectVideo }]);
  masterOutput.subscribe([{ source: input, sourceSelector: selectAV }]);

  console.log("MAIN > Manifest URL:\n ", masterOutput.playlistUrl);
  console.log();
  audioOutput.url().then(logMediaPlaylist("audio"));
  videoOutput.url().then(logMediaPlaylist("video"));
}

type KeyResponse = {
  encryptionKey: string,
  encryptionKeyId: string,
  encryptionPssh: string,
  mediaSignaling: string,
  masterSignaling: string,
  contentProtection: string,
};
type Multi<T> = {
  audio: T,
  video: T,
};

export async function obtainKey(encryptionKeyIds: Multi<string>): Promise<Multi<KeyResponse>> {
  // Use EZDRM_TOKEN or EZDRM_USERNAME+EZDRM_PASSWORD for authentication
  let auth: { t?: string, u?: string, p?: string } =
    process.env["EZDRM_TOKEN"] ? {
      t: process.env["EZDRM_TOKEN"],
    } : {
      u: process.env["EZDRM_USERNAME"],
      p: process.env["EZDRM_PASSWORD"],
    };
  let params = new URLSearchParams({
    k: `empty,audio1=${encryptionKeyIds.audio},video1=${encryptionKeyIds.video}`,
    c: "norskTest",
    ...auth,
  }).toString();
  let endpoint = "https://cpix.ezdrm.com/KeyGenerator/cpix2.aspx";
  let url = endpoint+"?"+params;
  //console.log(url);
  let response_inflight = await fetch(url);
  if (!response_inflight.ok) {
    throw new Error(response_inflight.status + " " + response_inflight.statusText);
  }
  let response = await response_inflight.text();

  // The endpoint returns a CPIX response, which we parse to JSON for convenience
  let parsed = new XMLParser({ ignoreDeclaration: true, ignorePiTags: true, ignoreAttributes: false }).parse(response);
  // The body of the CPIX response
  let cpix = parsed["cpix:CPIX"];

  let result: Multi<KeyResponse | undefined> = { audio: undefined, video: undefined };

  // Extract the information for audio and video keys from the CPIX
  for (let key of ["audio", "video"] as const) {
    let encryptionKeyId = encryptionKeyIds[key];

    // Extract the key from the ContentKeyList node
    let encryptionKey = "";
    let ContentKeys = XMLList(cpix["cpix:ContentKeyList"]["cpix:ContentKey"]);
    for (let ContentKey of ContentKeys) {
      if (ContentKey["@_kid"] !== encryptionKeyId) continue;
      let encryptionKeyBase64 = ContentKey["cpix:Data"]["pskc:Secret"]["pskc:PlainValue"];
      encryptionKey = Buffer.from(encryptionKeyBase64, "base64").toString("hex");
    }

    if (!encryptionKey) throw new Error(`Could not find encryption key ${encryptionKeyId} in response`);

    // Extract the PSSH boxes, which will get embedded into the MP4
    let encryptionPsshs: string[] = [];
    // And signaling data for playlists
    let mediaSignalings: string[] = [];
    let masterSignalings: string[] = [];
    let contentProtection: string = `
      <ContentProtection xmlns:cenc="urn:mpeg:cenc:2013" cenc:default_KID="${encryptionKeyId}"
        schemeIdUri="urn:mpeg:dash:mp4protection:2011" value="cenc" />
    `;

    let DRMSystems = XMLList(cpix["cpix:DRMSystemList"]["cpix:DRMSystem"]);
    for (let DRMSystem of DRMSystems) {
      if (DRMSystem["@_kid"] !== encryptionKeyId) continue;
      encryptionPsshs.push(DRMSystem["cpix:PSSH"] || "");
      mediaSignalings.push(playlist("media"));
      masterSignalings.push(playlist("master"));

      // Look up a playlist by name
      function playlist(name: "media" | "master") {
        for (let signaling of XMLList(DRMSystem["cpix:HLSSignalingData"])) {
          if (signaling["@_playlist"] === name) return XMLText(signaling);
          if (typeof signaling === "string" && name === "media") return signaling;
        }
        return "";
      }

      let systemId = DRMSystem["@_systemId"];
      if (typeof systemId === "string") {
        let contentProtectionData = XMLText(DRMSystem["cpix:ContentProtectionData"]);
        contentProtection += `
          <ContentProtection xmlns:cenc="urn:mpeg:cenc:2013" cenc:default_KID="${encryptionKeyId}"
            schemeIdUri="urn:uuid:${systemId}">
            ${un64(contentProtectionData)}
          </ContentProtection>
        `;
      }
    }

    // The data from each system gets concatenated together
    let encryptionPssh = cat64(encryptionPsshs);
    // with newline separators for the signaling
    let mediaSignaling = mediaSignalings.map(un64).join("\n");
    let masterSignaling = masterSignalings.map(un64).join("\n");

    result[key] = {
      encryptionKey,
      encryptionKeyId,
      encryptionPssh,
      mediaSignaling,
      masterSignaling,
      contentProtection,
    };
  }

  if (!result.audio || !result.video) {
    throw new Error("Missing audio and/or video encryption data");
  }

  return { audio: result.audio, video: result.video };

  // Helpers for picking apart the XML-as-JSON
  function XMLList(nodes: any): any[] {
    if (Array.isArray(nodes)) return nodes;
    return [nodes];
  }
  function XMLText(node: any): string {
    if (node === undefined || node === null) return "";
    if (typeof node === "string") return node;
    if (typeof node["#text"] === "string") return node["#text"];
    return "";
  }
  // Concat base64 representations
  function cat64(items: string[], sep?: string) {
    let buffers = items.map(s => Buffer.from(s, "base64"));
    if (sep) {
      let sepb = Buffer.from(sep, "utf-8");
      buffers = Array.prototype.concat(...buffers.map(b => [sepb, b])).slice(1);
    }
    return Buffer.concat(buffers).toString("base64");
  }
  function un64(encoded: string) {
    return Buffer.from(encoded, "base64").toString("utf-8");
  }
}

const segmentSettings = {
  partDurationSeconds: 1.0,
  segmentDurationSeconds: 4.0,
};

function logMediaPlaylist(name: string): (url: string) => void {
  return (
    url => { console.log(`${name} playlistUrl: ${url}`); }
  );
}

