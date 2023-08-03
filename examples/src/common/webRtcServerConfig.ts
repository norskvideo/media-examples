import { WhepOutputSettings } from "@norskvideo/norsk-sdk";

const hostIps = (process.env.CLIENT_HOST) ? { hostIps: [process.env.CLIENT_HOST] } : {}
const turnServers =
    (process.env.TURN_INTERNAL && process.env.TURN_EXTERNAL) ?
        // Separate hostnames for server and client access to the turn server as in some cases they cannot resolve the same IP
        {
            iceServers: [{ urls: [`turn:${process.env.TURN_INTERNAL}:3478`], username: "norsk", credential: "norsk" }],
            reportedIceServers: [{ urls: [`turn:${process.env.TURN_EXTERNAL}:3478`], username: "norsk", credential: "norsk" }],
        }
        : {}

export const webRtcServerConfig: WhepOutputSettings =
    { ...turnServers, ...hostIps };
