import { describe, expect, test } from '@jest/globals';

import { GeoPlugin } from '../../../src/plugins/geo.plugin.js';
import { setupGeoSuite } from './helpers.js';

describe('Geo Plugin - Resource created after install', () => {
  const ctx = setupGeoSuite();

  test('registers geo capabilities on resources created post-install', async () => {
    const plugin = new GeoPlugin({
      logLevel: 'silent',resources: {
        stores: {
          latField: 'latitude',
          lonField: 'longitude',
          precision: 5,
          addGeohash: true
        }
      }
    });

    await ctx.db.usePlugin(plugin);

    await ctx.db.createResource({
      name: 'stores',
      attributes: {
        name: 'string',
        latitude: 'number',
        longitude: 'number'
      }
    });

    const resource = ctx.db.resources.stores;

    expect(resource._geoConfig).toBeDefined();
    expect(resource.findNearby).toBeDefined();
    expect(resource.findInBounds).toBeDefined();
    expect(resource.getDistance).toBeDefined();

    const record = await resource.insert({
      name: 'Store 1',
      latitude: -23.5505,
      longitude: -46.6333
    });

    expect(record.geohash).toBeDefined();
  });
});

