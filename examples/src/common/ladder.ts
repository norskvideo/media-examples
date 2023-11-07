import { VideoEncodeRung, X264Codec, X264Preset } from "@norskvideo/norsk-sdk";

const renditions = ["high", "medium", "low", "LL-high", "LL-preview"] as const;
export type AppRenditionName = (typeof renditions)[number];
export type AppRenditions = readonly AppRenditionName[];

// Create a helper type where the name of the encode rung is restricted to one of our renditions
type AppEncodeRung = Omit<VideoEncodeRung, "name"> & { name: AppRenditionName };
export function mkRungs(
  renditionNames: readonly AppRenditionName[]
): VideoEncodeRung[] {
  function devOrPro<T>(a: T, b: T): T {
    return process.env.ENVIRONMENT !== "DEV" ? a : b;
  }
  const preset: X264Preset = devOrPro("veryfast", "medium");

  function x264CodecSettings(kbitrate: number): X264Codec {
    return {
      type: "x264",
      bitrateMode: { value: kbitrate, mode: "abr" },
      keyFrameIntervalMax: 50,
      keyFrameIntervalMin: 50,
      sceneCut: 0,
      preset,
    };
  }
  const highRung: AppEncodeRung = {
    name: "high",
    width: 1280,
    height: 720,
    frameRate: { frames: 25, seconds: 1 },
    codec: {
      ...x264CodecSettings(devOrPro(1_000, 2_000)),
      profile: "high",
      level: 4.1,
    },
  };
  const llHighRung: AppEncodeRung = {
    name: "LL-high",
    width: 1280,
    height: 720,
    frameRate: { frames: 25, seconds: 1 },
    codec: {
      ...x264CodecSettings(devOrPro(1_000, 2_000)),
      profile: "high",
      level: 4.1,
      tune: "zerolatency",
      bframes: 0,
    },
  };
  const mediumRung: AppEncodeRung = {
    name: "medium",
    width: 640,
    height: 360,
    frameRate: { frames: 25, seconds: 1 },
    codec: x264CodecSettings(600),
  };
  const lowRung: AppEncodeRung = {
    name: "low",
    width: 320,
    height: 180,
    frameRate: { frames: 25, seconds: 1 },
    codec: x264CodecSettings(150),
  };
  const llPreviewRung: AppEncodeRung = {
    name: "LL-preview",
    width: 320,
    height: 180,
    frameRate: { frames: 25, seconds: 1 },
    codec: {
      ...x264CodecSettings(150),
      tune: "zerolatency",
      bframes: 0,
    },
  };
  function nameToRung(name: AppRenditionName): VideoEncodeRung {
    switch (name) {
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
