export interface ClientAuth {
    clientId: string;
    clientSecret?: string;
    clientAssertion?: string;
}
export interface PARParams {
    [key: string]: string | undefined | null;
}
export interface PARResponse {
    request_uri: string;
    expires_in: number;
}
export interface PARErrorResponse {
    error: string;
    error_description?: string;
}
export interface DiscoveryDocument {
    pushed_authorization_request_endpoint?: string;
    [key: string]: unknown;
}
export interface PARConfig {
    clientId: string;
    clientSecret?: string;
    clientAssertion?: string;
}
export interface PARConfigValidation {
    valid: boolean;
    errors: string[] | null;
}
export declare function pushAuthorizationRequest(parEndpoint: string, params: PARParams, clientAuth: ClientAuth): Promise<PARResponse>;
export declare function buildPARAuthorizationUrl(authorizationEndpoint: string, request_uri: string, clientId: string): string;
export declare function providerSupportsPAR(discoveryDoc: DiscoveryDocument | null): boolean;
export declare function validatePARConfig(config: PARConfig, discoveryDoc: DiscoveryDocument | null): PARConfigValidation;
//# sourceMappingURL=oidc-par.d.ts.map