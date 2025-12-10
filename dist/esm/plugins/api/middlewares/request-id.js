import { idGenerator } from '../../../concerns/id.js';
export function createRequestIdMiddleware(config = {}) {
    const { headerName = 'X-Request-ID', generator = () => idGenerator(), includeInResponse = true, includeInLogs = true } = config;
    return async (c, next) => {
        let requestId = c.req.header(headerName);
        if (!requestId) {
            requestId = generator();
        }
        c.set('requestId', requestId);
        await next();
        if (includeInResponse) {
            c.header(headerName, requestId);
        }
    };
}
export default createRequestIdMiddleware;
//# sourceMappingURL=request-id.js.map