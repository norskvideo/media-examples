"use strict";
(() => {
  var __getOwnPropNames = Object.getOwnPropertyNames;
  var __commonJS = (cb, mod) => function __require() {
    return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
  };

  // node_modules/@norskvideo/webrtc-client/lib/cjs/webrtc.js
  var require_webrtc = __commonJS({
    "node_modules/@norskvideo/webrtc-client/lib/cjs/webrtc.js"(exports) {
      "use strict";
      var __awaiter = exports && exports.__awaiter || function(thisArg, _arguments, P, generator) {
        function adopt(value) {
          return value instanceof P ? value : new P(function(resolve) {
            resolve(value);
          });
        }
        return new (P || (P = Promise))(function(resolve, reject) {
          function fulfilled(value) {
            try {
              step(generator.next(value));
            } catch (e) {
              reject(e);
            }
          }
          function rejected(value) {
            try {
              step(generator["throw"](value));
            } catch (e) {
              reject(e);
            }
          }
          function step(result) {
            result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected);
          }
          step((generator = generator.apply(thisArg, _arguments || [])).next());
        });
      };
      Object.defineProperty(exports, "__esModule", { value: true });
      exports.DuplexClient = exports.WhipClient = exports.WhepClient = exports.WebRtcClient = void 0;
      var WebRtcClient = class extends EventTarget {
        constructor(config) {
          super();
          this.cachedCandidates = [];
          this.client = new RTCPeerConnection({
            // Can set STUN/TURN servers directly here if required, but the server will return the configured/requested servers
            iceServers: config.iceServers
          });
          if (!config) {
            throw new Error("Config is required");
          }
          if (!config.url) {
            throw new Error("Must specify endpoint url in config");
          }
          this.endpointUrl = new URL(config.url, document.location.href);
          this.client.addEventListener("icecandidate", (event) => this.handleIceCandidateFromClient(event));
          this.client.addEventListener("iceconnectionstatechange", (event) => this.handleIceConnectionChange(event));
          this.client.addEventListener("track", (event) => this.handleGotTrack(event));
        }
        handleIceCandidateFromClient(event) {
          return __awaiter(this, void 0, void 0, function* () {
            if (!event.candidate || !event.candidate.candidate) {
              console.log("client ice candidate gathering is done", event);
              return;
            }
            if (!this.sessionUrl) {
              console.debug("received candidate before response from session create, caching", event.candidate);
              this.cachedCandidates.push(event.candidate);
              return;
            }
            yield this.sendCandidate(event.candidate, false);
          });
        }
        sendOffer() {
          return __awaiter(this, void 0, void 0, function* () {
            const client = this.client;
            const localOffer = yield client.createOffer();
            console.debug("received local offer, sending to server", localOffer);
            let response = yield fetch(this.endpointUrl, {
              method: "POST",
              headers: {
                "Content-Type": "application/sdp"
              },
              body: localOffer.sdp
            });
            if (!response.ok) {
              this.onResponseError(response);
              return;
            }
            this.receiveIceServers(response.headers);
            const sessionUrl = response.headers.get("Location");
            if (sessionUrl == null) {
              throw new Error("Session not provided in Location header");
            }
            this.sessionUrl = new URL(sessionUrl, this.endpointUrl);
            const remoteOffer = yield response.text();
            console.log("Got response", { remoteOffer, sessionUrl });
            yield client.setLocalDescription(localOffer);
            const remoteResponse = yield client.setRemoteDescription({
              type: "answer",
              sdp: remoteOffer
            });
            console.log("Applied remote description", remoteResponse);
            console.log("Peer connection state", client);
            this.sendCachedCandidates();
          });
        }
        sendCandidate(candidate, isCached) {
          return __awaiter(this, void 0, void 0, function* () {
            if (isCached) {
              console.log("sending cached client ice candidate", candidate);
            } else {
              console.log("sending client ice candidate", candidate);
            }
            if (!this.sessionUrl) {
              throw new Error("Session url not set when expected");
            }
            yield fetch(this.sessionUrl, {
              method: "PATCH",
              headers: {
                "Content-Type": "application/trickle-ice-sdpfrag"
              },
              body: [
                "m=audio 9 RTP/AVP 0",
                "a=ice-ufrag:" + candidate.usernameFragment,
                "a=mid:" + candidate.sdpMid,
                "a=" + candidate.candidate
                // and the candidate itself
              ].join("\r\n")
            });
          });
        }
        sendCachedCandidates() {
          return __awaiter(this, void 0, void 0, function* () {
            for (const cachedCandidate of this.cachedCandidates) {
              yield this.sendCandidate(cachedCandidate, true);
            }
            this.cachedCandidates = [];
          });
        }
        handleIceConnectionChange(event) {
          console.log("client ice connection change", event);
        }
        handleGotTrack(event) {
          console.log("got track", event);
        }
        receiveIceServers(headers) {
          return __awaiter(this, void 0, void 0, function* () {
            let linkHeader = headers.get("link");
            if (!linkHeader) {
              return;
            }
            let servers = [];
            let links = linkHeader.split(",");
            for (let link of links) {
              let split = link.split(";").map((x) => x.trim());
              if (split.some((x) => x === `rel="ice-server"`)) {
                let urlMatch = split[0].match(/<(.+)>/);
                if (urlMatch) {
                  let server = { urls: [urlMatch[1]] };
                  for (let f of split) {
                    let pair = f.match(/([^=]+)="([^"]+)"/);
                    if (pair) {
                      switch (pair[1]) {
                        case "username":
                          server.username = pair[2];
                          break;
                        case "credential":
                          server.credential = pair[2];
                          break;
                        case "credential-type":
                          server.credentialType = pair[2];
                          break;
                      }
                    }
                  }
                  servers.push(server);
                }
              }
            }
            if (servers.length > 0) {
              let existingIceServers = this.client.getConfiguration().iceServers || [];
              if (existingIceServers.length == 0) {
                console.log("Received ICE server configuration from server, applying", { iceServers: servers });
                this.client.setConfiguration({
                  iceServers: servers
                });
              } else {
                console.log("Received ICE server configuration from server but have explicit configuration, ignoring", { existingIceServers, iceServers: servers });
              }
            }
          });
        }
        onResponseError(response) {
          return __awaiter(this, void 0, void 0, function* () {
            this.raise("responseerror", new CustomEvent("responseerror", { detail: response }));
          });
        }
        raise(type, ev) {
          this.dispatchEvent(ev);
        }
        addEventListener(type, listener, options) {
          super.addEventListener(type, listener);
        }
        removeEventListener(type, listener, options) {
          super.removeEventListener(type, listener);
        }
      };
      exports.WebRtcClient = WebRtcClient;
      var WhepClient = class extends WebRtcClient {
        constructor(config) {
          super(config);
          this.outputVideoTracks = [];
          this.videoElements = [];
          this.simulcastVideoCount = config.simulcastVideoCount || 1;
          this.container = config.container;
        }
        start() {
          return __awaiter(this, void 0, void 0, function* () {
            const client = this.client;
            for (let _ of Array(this.simulcastVideoCount)) {
              client.addTransceiver("video", { "direction": "recvonly" });
            }
            client.addTransceiver("audio", { "direction": "recvonly" });
            this.sendOffer();
          });
        }
        handleGotTrack(ev) {
          return __awaiter(this, void 0, void 0, function* () {
            console.log("Got a track", ev);
            if (ev.track.kind == "video" && ev.streams.length > 0) {
              this.outputVideoTracks.push(ev.track);
            }
            if (ev.track.kind == "audio") {
              this.outputAudioTrack = ev.track;
            }
            if (this.outputAudioTrack && this.outputVideoTracks.length > this.videoElements.length) {
              for (let i = 0; i < this.outputVideoTracks.length; i++) {
                if (this.videoElements[i])
                  continue;
                let stream = void 0;
                if (i == 0) {
                  stream = new MediaStream([this.outputAudioTrack, this.outputVideoTracks[i]]);
                } else {
                  stream = new MediaStream([this.outputVideoTracks[i]]);
                }
                if (this.container) {
                  this.videoElements.push(createPlayerElement(stream, this.container));
                }
              }
            }
          });
        }
      };
      exports.WhepClient = WhepClient;
      var WhipClient = class extends WebRtcClient {
        constructor(config) {
          super(config);
        }
        requestAccess() {
          return __awaiter(this, void 0, void 0, function* () {
            this.media = (yield requestAccess()) || void 0;
          });
        }
        start() {
          return __awaiter(this, void 0, void 0, function* () {
            if (this.media === void 0) {
              yield this.requestAccess();
              if (!this.media) {
                console.error("Could not access media devices");
                return false;
              }
            }
            const client = this.client;
            for (const track of this.media.getTracks()) {
              console.log("Adding track", track.id);
              client.addTrack(track);
            }
            yield this.sendOffer();
            return true;
          });
        }
      };
      exports.WhipClient = WhipClient;
      var DuplexClient = class extends WebRtcClient {
        constructor(config) {
          super(config);
          this.outputVideoTracks = [];
          this.videoElements = [];
          this.simulcastVideoCount = config.simulcastVideoCount || 1;
          this.container = config.container || document.getElementById("container");
        }
        requestAccess() {
          return __awaiter(this, void 0, void 0, function* () {
            this.media = (yield requestAccess()) || void 0;
          });
        }
        start() {
          return __awaiter(this, void 0, void 0, function* () {
            if (this.media === void 0) {
              yield this.requestAccess();
            }
            const client = this.client;
            for (let _ of Array(this.simulcastVideoCount)) {
              client.addTransceiver("video", { "direction": "recvonly" });
            }
            client.addTransceiver("audio", { "direction": "recvonly" });
            if (this.media) {
              for (const track of this.media.getTracks()) {
                console.log("Adding track", track.id);
                client.addTrack(track);
              }
            }
            this.sendOffer();
          });
        }
        // This is just like WHEP I just don't want to do a mixin or whatever
        handleGotTrack(ev) {
          return __awaiter(this, void 0, void 0, function* () {
            console.log("Got a track", ev);
            if (ev.track.kind == "video" && ev.streams.length > 0) {
              this.outputVideoTracks.push(ev.track);
            }
            if (ev.track.kind == "audio") {
              this.outputAudioTrack = ev.track;
            }
            if (this.outputAudioTrack && this.outputVideoTracks.length > this.videoElements.length) {
              for (let i = 0; i < this.outputVideoTracks.length; i++) {
                if (this.videoElements[i])
                  continue;
                let stream = void 0;
                if (i == 0) {
                  stream = new MediaStream([this.outputAudioTrack, this.outputVideoTracks[i]]);
                } else {
                  stream = new MediaStream([this.outputVideoTracks[i]]);
                }
                if (this.container) {
                  this.videoElements.push(createPlayerElement(stream, this.container));
                }
              }
            }
          });
        }
      };
      exports.DuplexClient = DuplexClient;
      function requestAccess() {
        return __awaiter(this, void 0, void 0, function* () {
          if (!navigator.mediaDevices) {
            console.log("Can't request user media (insecure context?)");
            return null;
          }
          console.log("Requesting access to user media");
          try {
            const media = yield navigator.mediaDevices.getUserMedia({ audio: true, video: true });
            console.debug(media);
            return media;
          } catch (err) {
            console.warn("Couldn't get user media", err);
            return null;
          }
        });
      }
      function createPlayerElement(stream, container) {
        var element = document.createElement("video");
        element.controls = true;
        container.appendChild(element);
        element.muted = true;
        element.autoplay = true;
        element.srcObject = stream;
        return element;
      }
    }
  });

  // workspaces/webrtc/lib/src/webrtc.js
  var require_webrtc2 = __commonJS({
    "workspaces/webrtc/lib/src/webrtc.js"(exports) {
      var __awaiter = exports && exports.__awaiter || function(thisArg, _arguments, P, generator) {
        function adopt(value) {
          return value instanceof P ? value : new P(function(resolve) {
            resolve(value);
          });
        }
        return new (P || (P = Promise))(function(resolve, reject) {
          function fulfilled(value) {
            try {
              step(generator.next(value));
            } catch (e) {
              reject(e);
            }
          }
          function rejected(value) {
            try {
              step(generator["throw"](value));
            } catch (e) {
              reject(e);
            }
          }
          function step(result) {
            result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected);
          }
          step((generator = generator.apply(thisArg, _arguments || [])).next());
        });
      };
      Object.defineProperty(exports, "__esModule", { value: true });
      var webrtc_client_1 = require_webrtc();
      window.WhepClient = webrtc_client_1.WhepClient;
      window.WhipClient = webrtc_client_1.WhipClient;
      window.DuplexClient = webrtc_client_1.DuplexClient;
      window.handleResponseError = function(x) {
        x.addEventListener("responseerror", (err) => __awaiter(this, void 0, void 0, function* () {
          const error = document.getElementById("error");
          const response = err.detail;
          if (error) {
            error.appendChild(document.createTextNode(`${response.status} ${response.statusText}`));
            error.appendChild(document.createElement("br"));
            const buttons = document.getElementById("buttons");
            if (buttons) {
              buttons.style.display = "";
            }
            const response_body = document.createElement("div");
            error.appendChild(response_body);
            response_body.textContent = yield response.text();
          }
        }));
      };
    }
  });
  require_webrtc2();
})();
