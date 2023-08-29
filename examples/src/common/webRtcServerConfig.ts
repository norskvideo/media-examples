import { WhepOutputSettings } from "@norskvideo/norsk-sdk";

export const webRtcServerConfig: WhepOutputSettings =
	(process.env.TURN_INTERNAL && process.env.TURN_EXTERNAL) ?
		// Separate hostnames for server and client access to the turn server as in some cases they cannot resolve the same IP
		{
			iceServers: [{ urls: [`turn:${process.env.TURN_INTERNAL}:3478`], username: "norsk", credential: "norsk" }],
			reportedIceServers: [{ urls: [`turn:${process.env.TURN_EXTERNAL}:3478`], username: "norsk", credential: "norsk" }],
		}
		: (process.env.TURN_MODE && process.env.TURN_MODE === "public") ? { iceServers: [{ urls: ['stun:stun.l.google.com:19302'] },] }
			: {}
