import { randomUUID } from "crypto";
import { XMLParser } from "fast-xml-parser";

type KeyResponse = {
  /**  Random seed we generate for each encryption session */
  encryptionKeyId: string,
  /**  Key returned by provider to encrypt with */
  encryptionKey: string,
  /** Crypto block for CMAF output */
  encryptionPssh: string,
  /** Signalling block for HLS media playlists */
  mediaSignaling: string,
  /** Signalling block for HLS multi-variant playlists */
  multivariantSignaling: string,
  /** Signalling block for DASH MDP files */
  dashSignalling: string,
};

export type CryptoDetails = {
  audio: KeyResponse,
  video: KeyResponse,
};

export type AVKeyIds = { audio: string, video: string }
export type CpixResponse = {
  encryptionKeyIds: AVKeyIds,
  cpix: string,
}

export function parseCpix(resp: CpixResponse): CryptoDetails {
  const parsed = new XMLParser({ ignoreDeclaration: true, ignorePiTags: true, ignoreAttributes: false }).parse(resp.cpix);
  const cpix = parsed["cpix:CPIX"];

  const result: Partial<CryptoDetails> = {};

  // Extract the information for audio and video keys from the CPIX
  for (const key of ["audio", "video"] as const) {
    const encryptionKeyId = resp.encryptionKeyIds[key];

    // Extract the key from the ContentKeyList node
    let encryptionKey = "";
    const ContentKeys = ensureXmlList(cpix["cpix:ContentKeyList"]["cpix:ContentKey"]);
    for (const ContentKey of ContentKeys) {
      if (ContentKey["@_kid"] !== encryptionKeyId) continue;
      const encryptionKeyBase64 = ContentKey["cpix:Data"]["pskc:Secret"]["pskc:PlainValue"];
      encryptionKey = Buffer.from(encryptionKeyBase64, "base64").toString("hex");
    }

    if (!encryptionKey) throw new Error(`Could not find encryption key ${encryptionKeyId} in response`);

    const encryptionPsshs: string[] = [];        // PSSH boxes, which will get embedded into the MP4
    const mediaSignalings: string[] = [];        // signaling data for HLS playlists
    const multivariantSignalings: string[] = []; //signaling data for HLS playlists
    let contentProtection: string = "";          // And entries for the MPD

    contentProtection +=  // Add the top level DASH entry
      `<ContentProtection xmlns:cenc="urn:mpeg:cenc:2013" cenc:default_KID="${encryptionKeyId}"
          schemeIdUri="urn:mpeg:dash:mp4protection:2011" value="cenc" />`;

    // Walk through each encryption system extracting the relevant information
    const DRMSystems = ensureXmlList(cpix["cpix:DRMSystemList"]["cpix:DRMSystem"]);

    for (const DRMSystem of DRMSystems) {
      if (DRMSystem["@_kid"] !== encryptionKeyId) continue;

      // Look up a playlist by name
      const playlist = (name: "media" | "master") => {
        for (const signaling of ensureXmlList(DRMSystem["cpix:HLSSignalingData"])) {
          if (typeof signaling === "string" && name === "media") return signaling;
          if (signaling["@_playlist"] === name) return ensureXmlText(signaling);
        }
        return "";
      }

      encryptionPsshs.push(DRMSystem["cpix:PSSH"] || "");
      mediaSignalings.push(playlist("media"));
      multivariantSignalings.push(playlist("master"));

      const systemId = DRMSystem["@_systemId"];
      if (typeof systemId === "string") {
        const contentProtectionData = ensureXmlText(DRMSystem["cpix:ContentProtectionData"]);   //DASH
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
    const multivariantSignaling = multivariantSignalings.map(un64).join("\n");

    result[key] = {
      encryptionKey,
      encryptionKeyId,
      encryptionPssh,
      mediaSignaling,
      multivariantSignaling,
      dashSignalling: contentProtection,
    };
  }

  if (!result.audio || !result.video) {
    throw new Error("Missing audio and/or video encryption data");
  }

  return { audio: result.audio, video: result.video };

  // Helpers for picking apart the XML-as-JSON
  function ensureXmlList<T>(nodes: T): T[] {
    if (Array.isArray(nodes)) return nodes;
    return [nodes];
  }
  function ensureXmlText(node: undefined | null | string | { "#text"?: string }): string {
    if (node === undefined || node === null) return "";
    if (typeof node === "string") return node;
    if (typeof node === "object" && "#text" in node && typeof node["#text"] === "string") return node["#text"];
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
