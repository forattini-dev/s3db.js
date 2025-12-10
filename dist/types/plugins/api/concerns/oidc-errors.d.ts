export declare const ErrorTypes: {
    readonly CONFIG_INVALID: "config_invalid";
    readonly MISSING_FIELD: "missing_field";
    readonly TOKEN_EXPIRED: "token_expired";
    readonly TOKEN_INVALID: "token_invalid";
    readonly TOKEN_MISSING: "token_missing";
    readonly ISSUER_MISMATCH: "issuer_mismatch";
    readonly AUDIENCE_MISMATCH: "audience_mismatch";
    readonly NONCE_MISMATCH: "nonce_mismatch";
    readonly PROVIDER_ERROR: "provider_error";
    readonly NETWORK_ERROR: "network_error";
    readonly DISCOVERY_FAILED: "discovery_failed";
    readonly STATE_MISMATCH: "state_mismatch";
    readonly STATE_EXPIRED: "state_expired";
    readonly UNKNOWN: "unknown";
};
export type ErrorType = typeof ErrorTypes[keyof typeof ErrorTypes];
export interface ErrorDetails {
    title: string;
    message: string;
    action: string;
    userAction: boolean;
    errorType: ErrorType;
    technicalDetails?: string[];
}
export interface ErrorPageOptions {
    returnUrl?: string;
    loginUrl?: string;
    supportUrl?: string | null;
    showTechnicalDetails?: boolean;
}
export interface ErrorJSONResponse {
    error: {
        code: ErrorType;
        title: string;
        message: string;
        userAction: boolean;
        details?: string[];
    };
    statusCode: number;
}
export declare function getErrorType(errors: string[] | null | undefined): ErrorType;
export declare function getErrorDetails(errorType: ErrorType, errors?: string[]): ErrorDetails;
export declare function generateErrorPage(errorDetails: ErrorDetails, options?: ErrorPageOptions): string;
export declare function generateErrorJSON(errorDetails: ErrorDetails, statusCode?: number): ErrorJSONResponse;
//# sourceMappingURL=oidc-errors.d.ts.map