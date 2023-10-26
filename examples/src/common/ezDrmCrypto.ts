import { randomUUID } from "crypto";
import { AVKeyIds, CpixResponse } from "./cpix";

export async function ezdrmCpix(keyIds?: AVKeyIds): Promise<CpixResponse> {
  const encryptionKeyIds = keyIds ?? { audio: randomUUID(), video: randomUUID() };
  const ezdrmEndpoint = "https://cpix.ezdrm.com/KeyGenerator/cpix2.aspx";

  // Use EZDRM_TOKEN or EZDRM_USERNAME+EZDRM_PASSWORD for authentication
  const auth: { t?: string, u?: string, p?: string } =
    process.env["EZDRM_TOKEN"] ? { t: process.env["EZDRM_TOKEN"], }
      : { u: process.env["EZDRM_USERNAME"], p: process.env["EZDRM_PASSWORD"], };
  const params = new URLSearchParams({
    k: `empty,audio1=${encryptionKeyIds.audio},video1=${encryptionKeyIds.video}`,
    c: "norskTest",
    ...auth,
  }).toString();

  const url = `${ezdrmEndpoint}?${params}`;

  const response_inflight = await fetch(url);
  if (!response_inflight.ok) {
    throw new Error(response_inflight.status + " " + response_inflight.statusText);
  }
  const response = await response_inflight.text();
  return ({ cpix: response, encryptionKeyIds });
}