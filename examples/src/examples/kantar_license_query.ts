import { Norsk } from "@norskvideo/norsk-sdk";
import path from 'path';

export async function main() {
  const norsk = await Norsk.connect();

  const offlineLicenseInfo = await norsk.processor.transform.audioWatermark.queryKantarOfflineLicense({
      type: "offline",
      kantarLicensePath: path.resolve("../../../licensing/kantar/license.lic"),
      audienceLicensePath: path.resolve("../../../licensing/kantar/license.aud"),
  });

  console.log("Offline license info:");
  console.dir(offlineLicenseInfo, {depth: null});

  const onlineLicenseInfo = await norsk.processor.transform.audioWatermark.queryKantarOnlineLicense({
      type: "online",
      login: process.env.KANTAR_LOGIN!,
      password: process.env.KANTAR_PASSWORD!,
      server: "licenseofe-integration.kantarmedia.fr"
  });

  console.log("Online license info:");
  console.dir(onlineLicenseInfo, {depth: null});

  const versionInfo = await norsk.processor.transform.audioWatermark.queryKantarVersion();

  console.log("Version info:");
  console.dir(versionInfo, {depth: null});


  await norsk.close();

}
