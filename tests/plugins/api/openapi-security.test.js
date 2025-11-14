import { describe, it, expect } from '@jest/globals';
import { generateOpenAPISpec } from '../../../src/plugins/api/utils/openapi-generator.js';

const buildDatabase = () => ({
  resources: {
    urls: {
      name: 'urls',
      version: 'v1',
      attributes: {
        slug: 'string|required'
      },
      config: {
        currentVersion: 'v1',
        description: 'URL resource',
        attributes: {
          slug: 'string|required'
        }
      },
      schema: {
        _pluginAttributes: null
      },
      $schema: {
        partitions: {},
        attributes: {
          slug: 'string|required'
        }
      }
    }
  },
  plugins: {}
});

describe('OpenAPI - path-based security', () => {

  it('applies security requirements when path rule requires auth', () => {
    const spec = generateOpenAPISpec(buildDatabase(), {
      auth: {
        drivers: [{ driver: 'basic', enabled: true }],
        pathRules: [
          { path: '/v1/**', methods: ['basic'], required: true }
        ]
      },
      versionPrefix: 'v1'
    });

    expect(spec.components.securitySchemes.basicAuth).toBeDefined();
    expect(spec.paths['/v1/urls'].get.security).toEqual([{ basicAuth: [] }]);
  });

  it('marks routes as public when path rule disables auth', () => {
    const spec = generateOpenAPISpec(buildDatabase(), {
      auth: {
        drivers: [{ driver: 'basic', enabled: true }],
        pathRules: [
          { path: '/v1/**', methods: ['basic'], required: false }
        ]
      },
      versionPrefix: 'v1'
    });

    expect(spec.paths['/v1/urls'].get.security).toBeUndefined();
  });
});
