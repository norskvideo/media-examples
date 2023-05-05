import { Norsk, StreamKeyOverrideSettings, TsFileOutputSettings, selectAudio, selectVideo } from "@id3asnorsk/norsk-sdk";

export async function main() {
    const norsk = await Norsk.connect({});

    let input = await norsk.input.rtmpServer({ id: "rtmpInput", port: 5001 });
    let videoPidNormalizer = await norsk.processor.transform.streamKeyOverride(videoStreamKeyConfig);
    let audioPidNormalizer = await norsk.processor.transform.streamKeyOverride(audioStreamKeyConfig);
    let output1 = await norsk.duplex.localWebRTC({ id: "localRtcOutput" });
    let output2 = await norsk.output.localTsFile(tsFileOutputSettings);

    videoPidNormalizer.subscribe([{ source: input, sourceSelector: selectVideo }]);
    audioPidNormalizer.subscribe([{ source: input, sourceSelector: selectAudio }]);

    let normalizedSources = [{ source: videoPidNormalizer, sourceSelector: selectVideo }, { source: audioPidNormalizer, sourceSelector: selectAudio }];
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
const tsFileOutputSettings: TsFileOutputSettings = {
    id: "localTsOutput",
    fileName: "/tmp/normalized.ts",
};
