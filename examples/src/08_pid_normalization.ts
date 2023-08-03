import { FileTsOutputSettings, Norsk, StreamKeyOverrideSettings, selectAudio, selectVideo } from "@norskvideo/norsk-sdk";
import { webRtcServerConfig } from "./common/webRtcServerConfig";

export async function main() {
    const norsk = await Norsk.connect();

    const input = await norsk.input.rtmpServer({ id: "rtmpInput" });
    const videoPidNormalizer = await norsk.processor.transform.streamKeyOverride(videoStreamKeyConfig);
    const audioPidNormalizer = await norsk.processor.transform.streamKeyOverride(audioStreamKeyConfig);
    const output1 = await norsk.output.whep({ id: "webrtc", ...webRtcServerConfig });
    const output2 = await norsk.output.fileTs(tsFileOutputSettings);

    videoPidNormalizer.subscribe([{ source: input, sourceSelector: selectVideo }]);
    audioPidNormalizer.subscribe([{ source: input, sourceSelector: selectAudio }]);

    const normalizedSources = [{ source: videoPidNormalizer, sourceSelector: selectVideo }, { source: audioPidNormalizer, sourceSelector: selectAudio }];
    output1.subscribe(normalizedSources);
    output2.subscribe(normalizedSources);

    console.log(`Local player: ${output1.playerUrl}`);
}

const videoStreamKeyConfig: StreamKeyOverrideSettings = {
    id: "video_stream_key",
    streamKey: {
        programNumber: 1,
        renditionName: "video",
        streamId: 256,
        sourceName: "input",
    },
};
const audioStreamKeyConfig: StreamKeyOverrideSettings = {
    id: "audio_stream_key",
    streamKey: {
        programNumber: 1,
        renditionName: "audio",
        streamId: 258,
        sourceName: "input",
    },
};
const tsFileOutputSettings: FileTsOutputSettings = {
    id: "localTsOutput",
    fileName: "/mnt/output/normalized.ts",
};
