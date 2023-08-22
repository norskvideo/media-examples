import {
  CmafDestinationSettings,
  Norsk,
  selectAudio,
  selectAV,
  selectPlaylist,
  selectVideo,
} from "@norskvideo/norsk-sdk";
import { randomUUID } from "crypto";
import { XMLParser } from "fast-xml-parser";
import jwt from "jsonwebtoken";

export async function main() {
  // Client generates the key IDs for audio and video
  // For production, you should use randomUUID()
  // But for testing, static key IDs may be convenient if you are copying the token
  const audioEncryptionKeyId = randomUUID();
  const videoEncryptionKeyId = randomUUID();

  console.log();
  if (!process.env["AXINOM_TENANT_ID"] || !process.env["AXINOM_MGMT_KEY"] || (!process.env["AXINOM_COM_KEY_ID"] !== !process.env["AXINOM_COM_KEY"])) {
    const envvar = (k: string) => "$" + k + " " + (process.env[k] ? "\u2713" : "\u2717");
    console.error(
      "Error: This example integration requires these environment variables to be set:\n ",
      envvar("AXINOM_TENANT_ID") + "\n ",
      "  Tenant ID from your Axinom DRM account\n ",
      envvar("AXINOM_MGMT_KEY") + "\n ",
      "  Management Key from your Axinom DRM account\n ",
      envvar("AXINOM_COM_KEY_ID") + " (optional, for playback)\n ",
      "  Communication Key ID from your Axinom DRM account\n ",
      envvar("AXINOM_COM_KEY") + " (optional, for playback)\n ",
      "  Communication Key from your Axinom DRM account",
    );
    return process.exit(1);
  }
  console.log("For testing Widevine/PlayReady playback with Shaka player, use the following configuration:");
  console.log("  https://shaka-player-demo.appspot.com/demo/");
  console.log("    NOTE: Your browser will need to consider Norsk secure for Shaka player to be able to play it, so either allow insecure content/disable CORS in your web browser, or add a HTTPS reverse proxy in front of the Norsk endpoint given below");
  console.log();
  console.log("DRM > Custom License Server URL:\n ", "https://drm-widevine-licensing.axprod.net/AcquireLicense");
  console.log("    OR\n ", "https://drm-playready-licensing.axprod.net/AcquireLicense");
  console.log("HEADERS > Header Name:\n ", "X-AxDRM-Message");
  // For playback, the license server needs a JWT for the right key IDs
  // (If you don't want to reconfigure this each time for testing,
  // set audioEncryptionKeyId and videoEncryptionKeyId to static values)
  console.log(
    "HEADERS > Header Value (*Changes each run):\n ",
    mkToken([audioEncryptionKeyId, videoEncryptionKeyId])
  );
  console.log();
  console.log("EXTRA CONFIG:\n ", JSON.stringify({
    "streaming": {
      "lowLatencyMode": true,
      "inaccurateManifestTolerance": 0,
      "rebufferingGoal": 0.01
    }
  }));

  const norsk = await Norsk.connect();

  const input = await norsk.input.rtmpServer({ id: "rtmpInput" });

  // Send these key IDs to Axinom and parse out the encryption information to
  // pass to the Norsk nodes.
  const { audio: audioEncryption, video: videoEncryption } = await obtainKeys({
    audio: audioEncryptionKeyId,
    video: videoEncryptionKeyId,
  });

  const fileOutput = await norsk.output.fileMp4({
    id: "file",
    fragmentedFileName: "/mnt/output/encrypted.mp4",
    audioEncryption,
    videoEncryption,
  });

  const audioOutput = await norsk.output.cmafAudio({
    id: "audio",
    destinations,
    encryption: audioEncryption,
    ...segmentSettings,
    m3uAdditions: audioEncryption.mediaSignaling,
    mpdAdditions: audioEncryption.contentProtection,
  });
  const videoOutput = await norsk.output.cmafVideo({
    id: "video",
    destinations,
    encryption: videoEncryption,
    ...segmentSettings,
    m3uAdditions: videoEncryption.mediaSignaling,
    mpdAdditions: videoEncryption.contentProtection,
  });
  const masterOutput = await norsk.output.cmafMultiVariant({
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
  masterOutput.subscribe([
    { source: audioOutput, sourceSelector: selectPlaylist },
    { source: videoOutput, sourceSelector: selectPlaylist }
  ]);

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

export async function obtainKeys(encryptionKeyIds: Multi<string>): Promise<Multi<KeyResponse>> {
  // Use AXINOM_TENANT_ID and AXINOM_MGMT_KEY to authenticate
  const endpoint = "https://key-server-management.axprod.net/api/SpekeV2";
  const auth = Buffer.from(`${process.env["AXINOM_TENANT_ID"]}:${process.env["AXINOM_MGMT_KEY"]}`, "utf-8").toString("base64");

  // Build a CPIX document containing the keys and systems
  const request = `
    <?xml version="1.0"?>
    <cpix:CPIX contentId="abc123" version="2.3" xmlns:cpix="urn:dashif:org:cpix" xmlns:pskc="urn:ietf:params:xml:ns:keyprov:pskc">
      <cpix:ContentKeyList>
        <cpix:ContentKey kid="${encryptionKeyIds.audio}" commonEncryptionScheme="cbcs"/>
        <cpix:ContentKey kid="${encryptionKeyIds.video}" commonEncryptionScheme="cbcs"/>
      </cpix:ContentKeyList>
      <cpix:DRMSystemList>
        <cpix:DRMSystem kid="${encryptionKeyIds.audio}" systemId="94ce86fb-07ff-4f43-adb8-93d2fa968ca2">
          <cpix:HLSSignalingData playlist="media"/>
          <cpix:HLSSignalingData playlist="master"/>
        </cpix:DRMSystem>
        <cpix:DRMSystem kid="${encryptionKeyIds.audio}" systemId="9a04f079-9840-4286-ab92-e65be0885f95">
          <cpix:PSSH/>
          <cpix:ContentProtectionData/>
          <cpix:HLSSignalingData playlist="media"/>
          <cpix:HLSSignalingData playlist="master"/>
          <cpix:SmoothStreamingProtectionHeaderData/>
        </cpix:DRMSystem>
        <cpix:DRMSystem kid="${encryptionKeyIds.audio}" systemId="edef8ba9-79d6-4ace-a3c8-27dcd51d21ed">
          <cpix:PSSH/>
          <cpix:ContentProtectionData/>
          <cpix:HLSSignalingData playlist="media"/>
          <cpix:HLSSignalingData playlist="master"/>
        </cpix:DRMSystem>
        <cpix:DRMSystem kid="${encryptionKeyIds.video}" systemId="94ce86fb-07ff-4f43-adb8-93d2fa968ca2">
          <cpix:HLSSignalingData playlist="media"/>
          <cpix:HLSSignalingData playlist="master"/>
        </cpix:DRMSystem>
        <cpix:DRMSystem kid="${encryptionKeyIds.video}" systemId="9a04f079-9840-4286-ab92-e65be0885f95">
          <cpix:PSSH/>
          <cpix:ContentProtectionData/>
          <cpix:HLSSignalingData playlist="media"/>
          <cpix:HLSSignalingData playlist="master"/>
          <cpix:SmoothStreamingProtectionHeaderData/>
        </cpix:DRMSystem>
        <cpix:DRMSystem kid="${encryptionKeyIds.video}" systemId="edef8ba9-79d6-4ace-a3c8-27dcd51d21ed">
          <cpix:PSSH/>
          <cpix:ContentProtectionData/>
          <cpix:HLSSignalingData playlist="media"/>
          <cpix:HLSSignalingData playlist="master"/>
        </cpix:DRMSystem>
      </cpix:DRMSystemList>
      <cpix:ContentKeyUsageRuleList>
        <cpix:ContentKeyUsageRule kid="${encryptionKeyIds.video}" intendedTrackType="VIDEO">
          <cpix:VideoFilter />
        </cpix:ContentKeyUsageRule>
        <cpix:ContentKeyUsageRule kid="${encryptionKeyIds.audio}" intendedTrackType="AUDIO">
          <cpix:AudioFilter />
        </cpix:ContentKeyUsageRule>
      </cpix:ContentKeyUsageRuleList>
    </cpix:CPIX>
  `.split('\n').map(line => line.substring(4)).join('\n').trim();
  const response_inflight = await fetch(endpoint, {
    method: "POST",
    withCredentials: true,
    credentials: "include",
    headers: {
      "Content-Type": "application/xml",
      "Authorization": "Basic " + auth,
      "X-Speke-Version": "2.0",
    },
    body: request,
  } as RequestInit);
  if (!response_inflight.ok) {
    throw new Error(response_inflight.status + " " + response_inflight.headers.get("x-axdrm-errormessage") || "unknown error from Axinom API");
  }
  const response = await response_inflight.text();

  // The endpoint returns a CPIX response, which we parse to JSON for convenience
  const parsed = new XMLParser({ ignoreDeclaration: true, ignorePiTags: true, ignoreAttributes: false }).parse(response);
  // The body of the CPIX response
  const cpix = parsed["cpix:CPIX"];

  const result: Multi<KeyResponse | undefined> = { audio: undefined, video: undefined };

  // Extract the information for audio and video keys from the CPIX
  for (const key of ["audio", "video"] as const) {
    const encryptionKeyId = encryptionKeyIds[key];

    // Extract the key from the ContentKeyList node
    let encryptionKey = "";
    const ContentKeys = XMLList(cpix["cpix:ContentKeyList"]["cpix:ContentKey"]);
    for (const ContentKey of ContentKeys) {
      if (ContentKey["@_kid"] !== encryptionKeyId) continue;
      const encryptionKeyBase64 = ContentKey["cpix:Data"]["pskc:Secret"]["pskc:PlainValue"];
      encryptionKey = Buffer.from(encryptionKeyBase64, "base64").toString("hex");
    }

    if (!encryptionKey) throw new Error(`Could not find encryption key ${encryptionKeyId} in response`);

    // Extract the PSSH boxes, which will get embedded into the MP4
    const encryptionPsshs: string[] = [];
    // And signaling data for playlists
    const mediaSignalings: string[] = [];
    const masterSignalings: string[] = [];
    let contentProtection: string = `
      <ContentProtection xmlns:cenc="urn:mpeg:cenc:2013" cenc:default_KID="${encryptionKeyId}"
        schemeIdUri="urn:mpeg:dash:mp4protection:2011" value="cenc" />
    `;

    const DRMSystems = XMLList(cpix["cpix:DRMSystemList"]["cpix:DRMSystem"]);
    for (const DRMSystem of DRMSystems) {
      if (DRMSystem["@_kid"] !== encryptionKeyId) continue;

      // Look up a playlist by name
      const playlist = (name: "media" | "master") => {
        for (const signaling of XMLList(DRMSystem["cpix:HLSSignalingData"])) {
          if (signaling["@_playlist"] === name) return XMLText(signaling);
          if (typeof signaling === "string" && name === "media") return signaling;
        }
        return "";
      }

      encryptionPsshs.push(DRMSystem["cpix:PSSH"] || "");
      mediaSignalings.push(playlist("media"));
      masterSignalings.push(playlist("master"));

      const systemId = DRMSystem["@_systemId"];
      if (typeof systemId === "string") {
        const contentProtectionData = XMLText(DRMSystem["cpix:ContentProtectionData"]);
        contentProtection += `
          <ContentProtection xmlns:cenc="urn:mpeg:cenc:2013" cenc:default_KID="${encryptionKeyId}"
            schemeIdUri="urn:uuid:${systemId}">
            ${un64(contentProtectionData)}
          </ContentProtection>
        `;
      }
    }

    // The data from each system gets concatenated together
    const encryptionPssh = cat64(encryptionPsshs);
    // with newline separators for the signaling
    const mediaSignaling = mediaSignalings.map(un64).join("\n");
    const masterSignaling = masterSignalings.map(un64).join("\n");

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
  function XMLList<T>(nodes: T): T[] {
    if (Array.isArray(nodes)) return nodes;
    return [nodes];
  }
  function XMLText(node: Element | Text | string | undefined | null): string {
    if (node === undefined || node === null) return "";
    if (typeof node === "string") return node;
    if (node instanceof Text) return node.textContent || "";
    if (node instanceof Element) {
        const textNode = node.textContent;
        if (textNode !== null) return textNode;
    }
    return "";
  }

  // Concat base64 representations
  function cat64(items: string[], sep?: string) {
    let buffers = items.map(s => Buffer.from(s, "base64"));
    if (sep) {
      const sepb = Buffer.from(sep, "utf-8");
      buffers = Array.prototype.concat(...buffers.map(b => [sepb, b])).slice(1);
    }
    return Buffer.concat(buffers).toString("base64");
  }
  function un64(encoded: string) {
    return Buffer.from(encoded, "base64").toString("utf-8");
  }
}

export function mkToken(keys: string[]) {
  if (!process.env["AXINOM_COM_KEY_ID"] && !process.env["AXINOM_COM_KEY"]) {
    return "[Need $AXINOM_COM_KEY_ID and $AXINOM_COM_KEY]";
  }
  // Generates an example token for client playback
  // See Axinom documentation for fields
  const msg = {
    "version": 1,
    "begin_date": "2000-01-01T09:53:22+03:00",
    "expiration_date": "2025-12-31T23:59:40+03:00",
    "com_key_id": process.env["AXINOM_COM_KEY_ID"],
    "message": {
      "type": "entitlement_message",
      "version": 2,
      "license": {
        "duration": 3600
      },
      "content_keys_source": {
        "inline": keys.map(id => ({ id }))
      }
    }
  };
  const communicationKey = Buffer.from(process.env["AXINOM_COM_KEY"] || "", "base64");
  return jwt.sign(msg, communicationKey, {
    "algorithm": "HS256",
    "noTimestamp": true
  });
}

const segmentSettings = {
  partDurationSeconds: 1.0,
  segmentDurationSeconds: 4.0,
};

const destinations: CmafDestinationSettings[] = [
  { type: "local", retentionPeriodSeconds: 10 }
];

function logMediaPlaylist(name: string): (url: string) => void {
  return (
    url => { console.log(`${name} playlistUrl: ${url}`); }
  );
}

