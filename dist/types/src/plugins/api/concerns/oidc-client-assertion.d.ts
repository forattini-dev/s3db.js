import type { JWK } from 'jose';
export interface ClientAssertionOptions {
    clientId: string;
    tokenEndpoint: string;
    privateKey: JWK;
    algorithm?: string;
    expiresIn?: number;
}
export interface OidcConfig {
    clientId: string;
    clientSecret?: string;
    privateKey?: JWK;
    tokenEndpointAuthMethod?: string;
}
export interface ClientAuth {
    method: string;
    clientId: string;
    clientSecret?: string;
    clientAssertion?: string;
    clientAssertionType?: string;
}
export interface RequestOptions {
    headers?: Record<string, string>;
    body?: URLSearchParams | string;
    [key: string]: unknown;
}
export interface PrivateKeyValidation {
    valid: boolean;
    errors: string[] | null;
}
export interface RSAKeyPair {
    privateKey: JWK;
    publicKey: JWK;
}
export interface GenerateKeyPairOptions {
    modulusLength?: number;
    keyId?: string;
}
export declare function generateClientAssertion(options: ClientAssertionOptions): Promise<string>;
export declare function createClientAuth(config: OidcConfig, tokenEndpoint: string): Promise<ClientAuth>;
export declare function applyClientAuth(clientAuth: ClientAuth, requestOptions: RequestOptions): RequestOptions;
export declare function validatePrivateKey(jwk: JWK | null | undefined): PrivateKeyValidation;
export declare function generateRSAKeyPair(options?: GenerateKeyPairOptions): Promise<RSAKeyPair>;
//# sourceMappingURL=oidc-client-assertion.d.ts.map