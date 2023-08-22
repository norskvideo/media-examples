import { Norsk, SrtInputSettings } from "@norskvideo/norsk-sdk";
import { input_to_ladder } from "./16_rtmp_to_ladder";

export async function main(): Promise<void> {
    const norsk = await Norsk.connect();
    const input = await norsk.input.srt(srtInputSettings);
    input_to_ladder(norsk, input);
}

const srtInputSettings: SrtInputSettings = {
    id: "srtInput",
    ip: "0.0.0.0",
    port: 5001,
    mode: "listener",
    sourceName: "camera1",
};
