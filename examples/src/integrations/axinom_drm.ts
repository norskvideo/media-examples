import {
  CmafDestinationSettings,
  Norsk,
  selectAudio,
  selectAV,
  selectVideo,
} from "@norskvideo/norsk-sdk";
import { randomUUID } from "crypto";
import { XMLParser } from "fast-xml-parser";
import jwt from "jsonwebtoken";
import fs from "fs/promises";

export async function main() {
  // Client generates the key IDs for audio and video
  // For production, you should use randomUUID()
  // But for testing, static key IDs may be convenient if you are copying the token
  let audioEncryptionKeyId = randomUUID();
  let videoEncryptionKeyId = randomUUID();

  console.log("For testing Widevine playback with Shaka player, use the following configuration:")
  console.log("  https://shaka-player-demo.appspot.com/demo/");
  console.log("DRM > Custom License Server URL:\n ", "https://drm-widevine-licensing.axprod.net/AcquireLicense");
  console.log("HEADERS > Header Name:\n ", "X-AxDRM-Message");
  // For playback, the license server needs a JWT for the right key IDs
  console.log("HEADERS > Header Value:\n ", mkToken([ audioEncryptionKeyId, videoEncryptionKeyId ]));
  console.log();
  console.log("EXTRA CONFIG:\n ", JSON.stringify({
    "streaming": {
      "lowLatencyMode": true,
      "inaccurateManifestTolerance": 0,
      "rebufferingGoal": 0.01
    }
  }));

  const norsk = await Norsk.connect();

  let input = await norsk.input.rtmpServer({ id: "rtmpInput" });

  // Send these key IDs to Axinom and parse out the encryption information to
  // pass to the Norsk nodes.
  let { audio: audioEncryption, video: videoEncryption } = await obtainKeys({
    audio: audioEncryptionKeyId,
    video: videoEncryptionKeyId,
  });

  let fileOutput = await norsk.output.fileMp4({
    id: "file",
    fragmentedFileName: "/tmp/encrypted.mp4",
    audioEncryption,
    videoEncryption,
  });

  let audioOutput = await norsk.output.cmafAudio({ id: "audio", destinations, encryption: audioEncryption, ...segmentSettings });
  let videoOutput = await norsk.output.cmafVideo({ id: "video", destinations, encryption: videoEncryption, ...segmentSettings });
  let masterOutput = await norsk.output.cmafMaster({ id: "master", playlistName: "master", destinations });

  fileOutput.subscribe([{ source: input, sourceSelector: selectAV }]);
  audioOutput.subscribe([{ source: input, sourceSelector: selectAudio }]);
  videoOutput.subscribe([{ source: input, sourceSelector: selectVideo }]);
  masterOutput.subscribe([{ source: input, sourceSelector: selectAV }]);

  console.log("MAIN > Manifest URL:\n ", masterOutput.playlistUrl);
  audioOutput.url().then(logMediaPlaylist("audio"));
  videoOutput.url().then(logMediaPlaylist("video"));
}

type KeyResponse = {
  encryptionKey: string,
  encryptionKeyId: string,
  encryptionPssh: string,
  mediaSignaling: string,
  masterSignaling: string,
};
type Multi<T> = {
  audio: T,
  video: T,
};

export async function obtainKeys(encryptionKeyIds: Multi<string>): Promise<Multi<KeyResponse>> {
  // Use AXINOM_TENANT_ID and AXINOM_MGMT_KEY to authenticate
  let endpoint = "https://key-server-management.axprod.net/api/SpekeV2";
  let auth = Buffer.from(`${process.env["AXINOM_TENANT_ID"]}:${process.env["AXINOM_MGMT_KEY"]}`, "utf-8").toString("base64");

  // Build a CPIX document containing the keys and systems
  let request = `
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
  let response_inflight = await fetch(endpoint, {
    method: "POST",
    withCredentials: true,
    credentials: "include",
    headers: {
      "Content-Type": "application/xml",
      "Authorization": "Basic "+auth,
      "X-Speke-Version": "2.0",
    },
    body: request,
  } as any);
  if (!response_inflight.ok) {
    throw new Error(response_inflight.status + " " + response_inflight.headers.get("x-axdrm-errormessage") || "unknown error from Axinom API");
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
    }

    // The data from each system gets concatenated together
    let encryptionPssh = cat64(encryptionPsshs);
    // with newline separators for the signaling
    let mediaSignaling = cat64(mediaSignalings, "\n");
    let masterSignaling = cat64(masterSignalings, "\n");

    result[key] = {
      encryptionKey,
      encryptionKeyId,
      encryptionPssh,
      mediaSignaling,
      masterSignaling,
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
}

export function mkToken(keys: string[]) {
  // Generates an example token for client playback
  // See Axinom documentation for fields
  let msg = {
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
  let communicationKey = Buffer.from(process.env["AXINOM_COM_KEY"] || "", "base64");
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

