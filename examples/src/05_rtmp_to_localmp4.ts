import { Norsk, selectAV } from "@norskvideo/norsk-sdk"

export async function main() {
  const norsk = await Norsk.connect({
    onShutdown: () => {
      console.log("Norsk has shutdown");
      process.exit(1)
    }
  });

  let input = await norsk.input.rtmpServer({ id: "rtmpInput" });
  let output = await norsk.output.fileMp4({
    id: "localMp4Output",
    fragmentedFileName: "/mnt/output/norskOutput.fmp4",
    nonfragmentedFileName: "/mnt/output/norskOutput.mp4",
    onEnd: () => {
      console.log("Closing Norsk");
      norsk.close();
    },
  });

  output.subscribe([{ source: input, sourceSelector: selectAV }]);

  // We can write non-fragmented snapshots periodically
  let i = 0;
  setInterval(() => {
    let fileRoot = "/mnt/output/norskOutput";
    output.writeFile(`${fileRoot}${i += 1}.mp4`)
  }, 5000
  );

  // And close it to write out the non-fragmented file name set in config
  // (will close norsk via onEnd callback above)
  setTimeout(() => { console.log("Timer expired, closing output"); output.close(); }, 30000);
}
