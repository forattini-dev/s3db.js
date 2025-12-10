import type { Context, Next, MiddlewareHandler } from 'hono';
import { BaseAuthStrategy, type BaseAuthStrategyOptions } from './base-strategy.class.js';
import { createAuthMiddleware } from '../index.js';
import { findBestMatch, type PathAuthRule as BasePathAuthRule } from '../../utils/path-matcher.js';

export interface PathAuthRule extends Partial<BasePathAuthRule> {
  path?: string;
}

export interface PathBasedAuthStrategyOptions extends BaseAuthStrategyOptions {
  pathAuth: PathAuthRule[];
}

export class PathBasedAuthStrategy extends BaseAuthStrategy {
  private pathAuth: PathAuthRule[];

  constructor({ drivers, authResource, oidcMiddleware, database, pathAuth, logLevel, logger }: PathBasedAuthStrategyOptions) {
    super({ drivers, authResource, oidcMiddleware, database, logLevel, logger });
    this.pathAuth = pathAuth;
  }

  override async createMiddleware(): Promise<MiddlewareHandler> {
    this.logger.debug('Using legacy pathAuth system');

    const methods = this.drivers
      .map(d => d.driver)
      .filter(d => d !== 'oauth2-server' && d !== 'oidc');

    const driverConfigs = this.extractDriverConfigs(null);

    const globalAuth = await createAuthMiddleware({
      methods,
      jwt: driverConfigs.jwt,
      apiKey: driverConfigs.apiKey,
      basic: driverConfigs.basic,
      oauth2: driverConfigs.oauth2,
      oidc: this.oidcMiddleware || null,
      database: this.database,
      optional: true
    });

    const ruleMiddlewares = new Map<string, MiddlewareHandler>();

    return async (c: Context, next: Next): Promise<Response | void> => {
      const requestPath = c.req.path;

      const matchedRule = findBestMatch(this.pathAuth as BasePathAuthRule[], requestPath);

      if (matchedRule) {
        this.logger.debug({ path: requestPath, pattern: matchedRule.pattern }, `Path ${requestPath} matched rule: ${matchedRule.pattern}`);
      } else {
        this.logger.debug({ path: requestPath }, `Path ${requestPath} no pathAuth rule matched (using global auth)`);
      }

      if (!matchedRule) {
        return await globalAuth(c, next);
      }

      if (!matchedRule.required) {
        return await next();
      }

      const ruleKey = JSON.stringify(matchedRule);
      if (!ruleMiddlewares.has(ruleKey)) {
        const ruleMethods = matchedRule.drivers || [];
        const ruleConfigs = this.extractDriverConfigs(ruleMethods);

        const ruleAuth = await createAuthMiddleware({
          methods: ruleMethods,
          jwt: ruleConfigs.jwt,
          apiKey: ruleConfigs.apiKey,
          basic: ruleConfigs.basic,
          oauth2: ruleConfigs.oauth2,
          oidc: this.oidcMiddleware || null,
          database: this.database,
          optional: false
        });

        ruleMiddlewares.set(ruleKey, ruleAuth);
      }

      return await ruleMiddlewares.get(ruleKey)!(c, next);
    };
  }
}
