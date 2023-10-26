import { randomUUID } from "crypto";
import { AVKeyIds, CpixResponse } from "./cpix";
import jwt from "jsonwebtoken";

export async function axinomCpix(keyIds?: AVKeyIds): Promise<CpixResponse> {
  const encryptionKeyIds = keyIds ?? { audio: randomUUID(), video: randomUUID() };

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
  return ({ cpix: response, encryptionKeyIds });
}

export function checkEnv(keyIds?: AVKeyIds) {
  const encryptionKeyIds = keyIds ?? { audio: randomUUID(), video: randomUUID() };
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
  console.log("For testing Widevine/PlayReady playback use the following configuration:");
  console.log();
  console.log("DRM > Custom License Server URL:\n ", "https://drm-widevine-licensing.axprod.net/AcquireLicense");
  console.log("    OR\n ", "https://drm-playready-licensing.axprod.net/AcquireLicense");
  console.log("HEADERS > Header Name:\n ", "X-AxDRM-Message");
  console.log(
    "HEADERS > Header Value (*Changes with encrptionKeyIds*):\n ",
    mkToken([encryptionKeyIds.audio, encryptionKeyIds.video])
  );
  return (encryptionKeyIds);
}


function mkToken(keys: string[]) {
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