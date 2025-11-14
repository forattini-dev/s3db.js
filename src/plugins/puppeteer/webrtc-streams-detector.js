/**
 * WebRTC & Streams Detector
 * Detection of WebRTC connections, media streams, and real-time communication
 *
 * Detects:
 * - WebRTC peer connections and ICE candidates
 * - Media streams (audio, video, display capture)
 * - getUserMedia calls and permissions
 * - Screen/display capture
 * - WebSocket and EventSource connections
 * - Streaming protocols (HLS, DASH, RTMP)
 */

/**
 * Detect WebRTC peer connections and ICE candidates
 */
export async function detectWebRTC(page) {
  try {
    const webrtcInfo = await page.evaluate(() => {
      const detected = {
        peerConnections: [],
        iceServers: [],
        iceGatheringState: null,
        connectionState: null,
        iceConnectionState: null,
        signalingState: null,
        dataChannels: [],
        mediaStreams: [],
        detectedIPs: [],
        stunServers: [],
        turnServers: [],
        isActive: false
      };

      // Check for RTCPeerConnection
      const RTCPeerConnection = window.RTCPeerConnection || window.webkitRTCPeerConnection || window.mozRTCPeerConnection;

      if (RTCPeerConnection) {
        detected.isActive = true;

        // Try to get connection info
        try {
          const tempPc = new RTCPeerConnection({ iceServers: [] });

          // Intercept ICE server discovery
          tempPc.onicecandidate = (event) => {
            if (event.candidate) {
              detected.detectedIPs.push({
                candidate: event.candidate.candidate,
                protocol: event.candidate.protocol,
                type: event.candidate.type,
                address: event.candidate.address,
                port: event.candidate.port
              });
            }
          };

          // Get connection state
          detected.connectionState = tempPc.connectionState;
          detected.iceConnectionState = tempPc.iceConnectionState;
          detected.iceGatheringState = tempPc.iceGatheringState;
          detected.signalingState = tempPc.signalingState;

          // Create offer to trigger ICE gathering
          tempPc.createOffer().then((offer) => {
            tempPc.setLocalDescription(offer).catch(() => {});
          }).catch(() => {});

          // Close after gathering
          setTimeout(() => {
            tempPc.close();
          }, 1000);
        } catch (err) {
          // Error creating peer connection
        }

        // Check for existing peer connections
        if (window.peerConnections && typeof window.peerConnections === 'object') {
          for (const key in window.peerConnections) {
            const pc = window.peerConnections[key];
            if (pc instanceof RTCPeerConnection) {
              detected.peerConnections.push({
                id: key,
                connectionState: pc.connectionState,
                iceConnectionState: pc.iceConnectionState
              });
            }
          }
        }
      }

      // Check for getUserMedia permissions and calls
      const originalGetUserMedia = navigator.mediaDevices.getUserMedia;
      if (originalGetUserMedia) {
        detected.mediaStreams.push('getUserMedia available');
      }

      // Check for getDisplayMedia (screen capture)
      const originalGetDisplayMedia = navigator.mediaDevices.getDisplayMedia;
      if (originalGetDisplayMedia) {
        detected.mediaStreams.push('getDisplayMedia available');
      }

      // Check for enumerateDevices (camera, microphone detection)
      const originalEnumerateDevices = navigator.mediaDevices.enumerateDevices;
      if (originalEnumerateDevices) {
        detected.mediaStreams.push('enumerateDevices available');
      }

      // Check for WebSocket
      if (window.WebSocket) {
        detected.mediaStreams.push('WebSocket available');
      }

      // Check for EventSource (Server-Sent Events)
      if (window.EventSource) {
        detected.mediaStreams.push('EventSource available');
      }

      return detected;
    });

    return {
      webrtcDetected: webrtcInfo.isActive,
      webrtcInfo
    };
  } catch (error) {
    return {
      webrtcDetected: false,
      error: error.message
    };
  }
}

/**
 * Detect media streams (audio, video, display capture)
 */
export async function detectMediaStreams(page) {
  try {
    const streamsInfo = await page.evaluate(() => {
      const detected = {
        audioElements: [],
        videoElements: [],
        canvasElements: [],
        mediaRecorders: [],
        audioContexts: [],
        videoStreams: [],
        displayCapture: false,
        permissions: {
          microphone: 'unknown',
          camera: 'unknown',
          displayCapture: 'unknown'
        }
      };

      // Detect audio elements
      const audioElements = document.querySelectorAll('audio');
      audioElements.forEach((audio) => {
        detected.audioElements.push({
          src: audio.src,
          sources: Array.from(audio.querySelectorAll('source')).map((s) => ({
            src: s.src,
            type: s.type
          })),
          autoplay: audio.autoplay,
          controls: audio.controls,
          loop: audio.loop,
          muted: audio.muted
        });
      });

      // Detect video elements
      const videoElements = document.querySelectorAll('video');
      videoElements.forEach((video) => {
        detected.videoElements.push({
          src: video.src,
          sources: Array.from(video.querySelectorAll('source')).map((s) => ({
            src: s.src,
            type: s.type
          })),
          width: video.width,
          height: video.height,
          autoplay: video.autoplay,
          controls: video.controls,
          loop: video.loop,
          muted: video.muted,
          poster: video.poster
        });
      });

      // Detect canvas elements
      const canvasElements = document.querySelectorAll('canvas');
      canvasElements.forEach((canvas) => {
        detected.canvasElements.push({
          width: canvas.width,
          height: canvas.height,
          id: canvas.id,
          class: canvas.className
        });
      });

      // Check for MediaRecorder
      if (window.MediaRecorder) {
        detected.mediaRecorders.push('MediaRecorder available');
      }

      // Check for AudioContext
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (AudioContext) {
        detected.audioContexts.push('AudioContext available');
      }

      // Check permissions API
      if (navigator.permissions) {
        navigator.permissions.query({ name: 'microphone' }).then((result) => {
          detected.permissions.microphone = result.state;
        }).catch(() => {});

        navigator.permissions.query({ name: 'camera' }).then((result) => {
          detected.permissions.camera = result.state;
        }).catch(() => {});
      }

      // Check for display capture support
      if (navigator.mediaDevices && navigator.mediaDevices.getDisplayMedia) {
        detected.displayCapture = true;
      }

      return detected;
    });

    return {
      streamsDetected: streamsInfo.audioElements.length > 0 || streamsInfo.videoElements.length > 0,
      streamsInfo
    };
  } catch (error) {
    return {
      streamsDetected: false,
      error: error.message
    };
  }
}

/**
 * Detect streaming protocols (HLS, DASH, etc.)
 */
export async function detectStreamingProtocols(page) {
  try {
    const protocolsInfo = await page.evaluate(() => {
      const detected = {
        hls: false,
        dash: false,
        rtmp: false,
        smoothStreaming: false,
        protocols: [],
        m3u8Files: [],
        mpdFiles: [],
        manifestFiles: []
      };

      // Check for HLS.js
      if (window.Hls) {
        detected.hls = true;
        detected.protocols.push('HLS (hls.js)');
      }

      // Check for DASH.js
      if (window.dashjs) {
        detected.dash = true;
        detected.protocols.push('DASH (dash.js)');
      }

      // Check for Shaka Player
      if (window.shaka) {
        detected.protocols.push('Shaka Player');
      }

      // Check for Video.js
      if (window.videojs) {
        detected.protocols.push('Video.js');
      }

      // Check for JW Player
      if (window.jwplayer) {
        detected.protocols.push('JW Player');
      }

      // Check all script sources for streaming indicators
      const scripts = document.querySelectorAll('script');
      scripts.forEach((script) => {
        if (script.src) {
          if (script.src.includes('.m3u8')) {
            detected.m3u8Files.push(script.src);
            detected.hls = true;
          }
          if (script.src.includes('.mpd')) {
            detected.mpdFiles.push(script.src);
            detected.dash = true;
          }
        }
      });

      // Check video sources
      const videos = document.querySelectorAll('video source');
      videos.forEach((source) => {
        const src = source.src || source.getAttribute('src');
        if (src) {
          if (src.includes('.m3u8')) {
            detected.m3u8Files.push(src);
            detected.hls = true;
          }
          if (src.includes('.mpd')) {
            detected.mpdFiles.push(src);
            detected.dash = true;
          }
        }
      });

      // Check all links and sources
      const links = document.querySelectorAll('a[href], [data-src], [data-url]');
      links.forEach((link) => {
        const href = link.href || link.getAttribute('data-src') || link.getAttribute('data-url');
        if (href) {
          if (href.includes('.m3u8')) {
            detected.m3u8Files.push(href);
            detected.hls = true;
          }
          if (href.includes('.mpd')) {
            detected.mpdFiles.push(href);
            detected.dash = true;
          }
        }
      });

      return detected;
    });

    return {
      streamingProtocolsDetected: protocolsInfo.hls || protocolsInfo.dash || protocolsInfo.protocols.length > 0,
      protocolsInfo
    };
  } catch (error) {
    return {
      streamingProtocolsDetected: false,
      error: error.message
    };
  }
}

/**
 * Comprehensive WebRTC and Streams detection
 */
export async function detectWebRTCAndStreams(page) {
  try {
    const [webrtc, streams, protocols] = await Promise.all([
      detectWebRTC(page),
      detectMediaStreams(page),
      detectStreamingProtocols(page)
    ]);

    return {
      webrtc,
      streams,
      protocols,
      summary: {
        webrtcActive: webrtc.webrtcDetected,
        streamsPresent: streams.streamsDetected,
        streamingProtocols: protocols.streamingProtocolsDetected,
        anyActivity: webrtc.webrtcDetected || streams.streamsDetected || protocols.streamingProtocolsDetected
      }
    };
  } catch (error) {
    return {
      error: error.message,
      summary: {
        webrtcActive: false,
        streamsPresent: false,
        streamingProtocols: false,
        anyActivity: false
      }
    };
  }
}
