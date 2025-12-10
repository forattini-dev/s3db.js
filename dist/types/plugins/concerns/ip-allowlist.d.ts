export interface HonoContext {
    req: {
        header(name: string): string | undefined;
        raw: {
            socket?: {
                remoteAddress?: string;
            };
        };
    };
}
export declare function isIpAllowed(ip: string | null | undefined, allowlist?: string[]): boolean;
export declare function getClientIp(c: HonoContext): string | null;
declare const _default: {
    isIpAllowed: typeof isIpAllowed;
    getClientIp: typeof getClientIp;
};
export default _default;
//# sourceMappingURL=ip-allowlist.d.ts.map