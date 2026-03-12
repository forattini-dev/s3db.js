import { describe, expect, it } from 'vitest';
import { normalizeSchemaDescriptor } from 'raffel';
import { generateOpenAPISpec } from '../../../src/plugins/api/utils/openapi-generator.js';

function buildDatabase() {
  return {
    resources: {},
    pluginRegistry: {}
  };
}

describe('OpenAPI schema descriptor integration', () => {
  it('uses explicit route descriptors for custom route request and response schemas', () => {
    const opaqueDescriptor = normalizeSchemaDescriptor(new Map(), { target: 'openApi3' });
    const responseDescriptor = normalizeSchemaDescriptor({
      type: 'object',
      properties: {
        ok: { type: 'boolean' }
      },
      required: ['ok']
    }, { target: 'openApi3' });

    const spec = generateOpenAPISpec(buildDatabase() as never, {
      routeRegistry: {
        list: () => [{
          kind: 'plugin-custom',
          path: '/contracts',
          methods: ['POST'],
          originalKey: 'POST /contracts',
          schema: {
            input: opaqueDescriptor,
            output: responseDescriptor
          }
        }]
      }
    });

    const requestSchema = spec.paths['/contracts']?.post?.requestBody?.content['application/json']?.schema as Record<string, unknown>;
    const responseSchema = spec.paths['/contracts']?.post?.responses['200']?.content?.['application/json']?.schema as Record<string, unknown>;

    expect(requestSchema['x-raffel-opaque']).toBe(true);
    expect(Array.isArray(requestSchema['x-raffel-diagnostics'])).toBe(true);
    expect(responseSchema.properties).toMatchObject({
      ok: { type: 'boolean' }
    });
  });
});
