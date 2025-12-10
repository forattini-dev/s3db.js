export interface ICECandidate {
    candidate: string;
    protocol?: string;
    type?: string;
    address?: string | null;
    port?: number | null;
}
export interface PeerConnectionInfo {
    id: string;
    connectionState?: string;
    iceConnectionState?: string;
}
export interface WebRTCInfo {
    peerConnections: PeerConnectionInfo[];
    iceServers: unknown[];
    iceGatheringState: string | null;
    connectionState: string | null;
    iceConnectionState: string | null;
    signalingState: string | null;
    dataChannels: unknown[];
    mediaStreams: string[];
    detectedIPs: ICECandidate[];
    stunServers: string[];
    turnServers: string[];
    isActive: boolean;
}
export interface WebRTCDetectionResult {
    webrtcDetected: boolean;
    webrtcInfo?: WebRTCInfo;
    error?: string;
}
export interface AudioElementInfo {
    src: string;
    sources: Array<{
        src: string;
        type: string;
    }>;
    autoplay: boolean;
    controls: boolean;
    loop: boolean;
    muted: boolean;
}
export interface VideoElementInfo {
    src: string;
    sources: Array<{
        src: string;
        type: string;
    }>;
    width: number;
    height: number;
    autoplay: boolean;
    controls: boolean;
    loop: boolean;
    muted: boolean;
    poster: string;
}
export interface CanvasElementInfo {
    width: number;
    height: number;
    id: string;
    class: string;
}
export interface MediaPermissions {
    microphone: string;
    camera: string;
    displayCapture: string;
}
export interface MediaStreamsInfo {
    audioElements: AudioElementInfo[];
    videoElements: VideoElementInfo[];
    canvasElements: CanvasElementInfo[];
    mediaRecorders: string[];
    audioContexts: string[];
    videoStreams: unknown[];
    displayCapture: boolean;
    permissions: MediaPermissions;
}
export interface MediaStreamsDetectionResult {
    streamsDetected: boolean;
    streamsInfo?: MediaStreamsInfo;
    error?: string;
}
export interface StreamingProtocolsInfo {
    hls: boolean;
    dash: boolean;
    rtmp: boolean;
    smoothStreaming: boolean;
    protocols: string[];
    m3u8Files: string[];
    mpdFiles: string[];
    manifestFiles: string[];
}
export interface StreamingProtocolsDetectionResult {
    streamingProtocolsDetected: boolean;
    protocolsInfo?: StreamingProtocolsInfo;
    error?: string;
}
export interface WebRTCAndStreamsResult {
    webrtc: WebRTCDetectionResult;
    streams: MediaStreamsDetectionResult;
    protocols: StreamingProtocolsDetectionResult;
    summary: {
        webrtcActive: boolean;
        streamsPresent: boolean;
        streamingProtocols: boolean;
        anyActivity: boolean;
    };
    error?: string;
}
interface Page {
    evaluate<T>(fn: () => T | Promise<T>): Promise<T>;
}
export declare function detectWebRTC(page: Page): Promise<WebRTCDetectionResult>;
export declare function detectMediaStreams(page: Page): Promise<MediaStreamsDetectionResult>;
export declare function detectStreamingProtocols(page: Page): Promise<StreamingProtocolsDetectionResult>;
export declare function detectWebRTCAndStreams(page: Page): Promise<WebRTCAndStreamsResult>;
export {};
//# sourceMappingURL=webrtc-streams-detector.d.ts.map