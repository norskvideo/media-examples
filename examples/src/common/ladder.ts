import { AmdMA35DH264, AmdMA35DHevc, VideoEncodeRung, X264Codec, X264Preset, X265Codec } from "@norskvideo/norsk-sdk";

const renditions = ["hevc", "high", "medium", "low", "LL-high", "LL-preview"] as const;
export type AppRenditionName = (typeof renditions)[number];
export type AppRenditions = readonly AppRenditionName[];

// Create a helper type where the name of the encode rung is restricted to one of our renditions
type AppEncodeRung = Omit<VideoEncodeRung, "name"> & { name: AppRenditionName };

export function mkRungs(
  renditionNames: readonly AppRenditionName[],
  codecFlavour: "software" | "ma35d" = "software"
): VideoEncodeRung[] {

  function devOrPro<T>(a: T, b: T): T {
    return process.env.ENVIRONMENT !== "DEV" ? a : b;
  }

  function x265CodecSettings(kbitrate: number): X265Codec {
    const preset = devOrPro("veryfast", "medium");
    return {
      type: "x265",
      bitrateMode: { value: kbitrate, mode: "abr" },
      keyFrameIntervalMax: 50,
      keyFrameIntervalMin: 50,
      sceneCut: 0,
      preset,
    };
  }
  
  function x264CodecSettings(kbitrate: number): X264Codec {
    const preset: X264Preset = devOrPro("veryfast", "medium");
    return {
      type: "x264",
      bitrateMode: { value: kbitrate, mode: "abr" },
      keyFrameIntervalMax: 50,
      keyFrameIntervalMin: 50,
      sceneCut: 0,
      preset,
    };
  }

  function amdMA35DHEVCCodecSettings(kbitrate: number): AmdMA35DHevc {
    return {
      type: "amdMA35D-hevc" as const,
      profile: "main",
      rateControl: { mode: "cbr", bitrate: kbitrate},
      gopSize: 50,
    };
  }

  function amdMA35DH264CodecSettings(kbitrate: number): AmdMA35DH264 {
    return {
      type: "amdMA35D-h264" as const,
      profile: "main",
      rateControl: { mode: "cbr", bitrate: kbitrate},
      gopSize: 50,
    };
  }

  function codecSettings(choices: {software: VideoEncodeRung["codec"], ma35d: VideoEncodeRung["codec"]}) {
    return choices[codecFlavour];
  }

  const hevcRung: AppEncodeRung = {
    name: "hevc",
    width: 1920,
    height: 1080,
    frameRate: { frames: 25, seconds: 1 },
    codec: 
      codecSettings({software: {...x265CodecSettings(devOrPro(1_000, 2_000)), profile: "main", level: 4.1}, 
                     ma35d: {...amdMA35DHEVCCodecSettings(10_000), profile: "main", level: 4.1} 
                    })
  };
  
  const highRung: AppEncodeRung = {
    name: "high",
    width: 1280,
    height: 720,
    frameRate: { frames: 25, seconds: 1 },
    codec: 
      codecSettings({software: {...x264CodecSettings(devOrPro(1_000, 2_000)), profile: "high", level: 4.1},
                     ma35d: {...amdMA35DH264CodecSettings(5_000), profile: "high", level: 4.1}
                    }) 
  };
  const llHighRung: AppEncodeRung = {
    name: "LL-high",
    width: 1280,
    height: 720,
    frameRate: { frames: 25, seconds: 1 },
    codec: 
      codecSettings({software: {...x264CodecSettings(devOrPro(1_000, 2_000)),
                                profile: "high",
                                level: 4.1,
                                tune: "zerolatency",
                                bframes: 0
                               },
                      ma35d: {...amdMA35DH264CodecSettings(5_000), 
                              profile: "high", 
                              level: 4.1,
                              bf: 0,
                              lookaheadDepth: 0
                             }
                    })
  };
  const mediumRung: AppEncodeRung = {
    name: "medium",
    width: 640,
    height: 360,
    frameRate: { frames: 25, seconds: 1 },
    codec: 
      codecSettings({software: x264CodecSettings(600),
                     ma35d: amdMA35DH264CodecSettings(2_500)
                    })
  };
  const lowRung: AppEncodeRung = {
    name: "low",
    width: 320,
    height: 180,
    frameRate: { frames: 25, seconds: 1 },
    codec: 
      codecSettings({software: x264CodecSettings(150),
                     ma35d: amdMA35DH264CodecSettings(1_500)
                    })
  };
  const llPreviewRung: AppEncodeRung = {
    name: "LL-preview",
    width: 320,
    height: 180,
    frameRate: { frames: 25, seconds: 1 },
    codec: 
      codecSettings({software: {...x264CodecSettings(150),
                                tune: "zerolatency",
                                bframes: 0
                               },
                      ma35d: {...amdMA35DH264CodecSettings(1_500),
                              bf: 0,
                              lookaheadDepth: 0
                             }
                    })
  };
  function nameToRung(name: AppRenditionName): VideoEncodeRung {
    switch (name) {
      case "hevc": {
        return hevcRung;
      }
      case "high": {
        return highRung;
      }
      case "medium": {
        return mediumRung;
      }
      case "low": {
        return lowRung;
      }
      case "LL-high": {
        return llHighRung;
      }
      case "LL-preview": {
        return llPreviewRung;
      }
    }
    return assertUnreachable(name);
  }
  return renditionNames.map(nameToRung);
}

function assertUnreachable(_x: never): never {
  throw new Error("Didn't expect to get here");
}
