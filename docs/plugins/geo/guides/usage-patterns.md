# Usage Patterns

> **In this guide:** Progressive adoption levels, partitioning for speed, and advanced patterns.

**Navigation:** [← Back to Geo Plugin](../README.md) | [Configuration](./configuration.md)

---

## Level 1: Basic Proximity Search

Start here if you just need "find locations near me":

```javascript
import { Database } from 's3db.js';
import { GeoPlugin } from 's3db.js';

const db = new Database({ connectionString: 's3://key:secret@bucket' });
await db.connect();

// Step 1: Add plugin (precision 6 = ~1.2km cells, good default)
await db.usePlugin(new GeoPlugin({
  resources: {
    stores: { latField: 'latitude', lonField: 'longitude', precision: 6 }
  }
}));

// Step 2: Create resource
const stores = await db.createResource({
  name: 'stores',
  attributes: {
    name: 'string|required',
    latitude: 'number|required',
    longitude: 'number|required'
  }
});

// Step 3: Insert locations (geohash added automatically)
await stores.insert({
  name: 'Downtown Store',
  latitude: -23.5505,
  longitude: -46.6333
});

// Step 4: Find nearby
const nearby = await stores.findNearby({
  lat: -23.5505,
  lon: -46.6333,
  radius: 5  // 5km radius
});

console.log(`Found ${nearby.length} nearby stores`);
```

**What you get:** Simple proximity search without manually calculating distances.

---

## Level 2: Add Partitioning for Speed

Once you have >1000 locations, add partitioning to go from O(n) to O(1):

```javascript
// Step 1: Enable geohash field storage
await db.usePlugin(new GeoPlugin({
  resources: {
    stores: {
      latField: 'latitude',
      lonField: 'longitude',
      precision: 6,
      addGeohash: true  // Adds '_geohash' field to records
    }
  }
}));

// Step 2: Create resource with geohash partition
const stores = await db.createResource({
  name: 'stores',
  attributes: {
    name: 'string',
    latitude: 'number',
    longitude: 'number',
    _geohash: 'string'
  },
  partitions: {
    byGeohash: { fields: { _geohash: 'string' } }
  }
});

// Step 3: Queries now use partition (queries ~9 cells vs all records)
const nearby = await stores.findNearby({ lat, lon, radius: 5 });
// Before: 4+ seconds scanning 12,000 records
// After: ~180ms querying 9 partitions
```

**What you get:** 20-100x faster queries as your dataset grows.

---

## Level 3: Multi-Resolution Search

For map applications with different zoom levels:

```javascript
// Use different precision based on zoom/radius
function getPrecisionForRadius(radiusKm) {
  if (radiusKm > 50) return 4;   // ~20km cells for city-wide
  if (radiusKm > 10) return 5;   // ~5km cells for district
  if (radiusKm > 2) return 6;    // ~1.2km cells for neighborhood
  return 7;                       // ~150m cells for street-level
}

// Narrow search as user zooms in
const precision = getPrecisionForRadius(searchRadius);
const geohash = geoPlugin.encodeGeohash(lat, lon, precision);

// Query specific cell
const results = await stores.listPartition({
  partition: 'byGeohash',
  partitionValues: { _geohash: geohash }
});
```

**What you get:** Optimal performance at any zoom level.

---

## Level 4: Cross-Border Search

Handle edge cases where locations span geohash boundaries:

```javascript
// Search near cell boundaries includes neighbors
const centerHash = plugin.encodeGeohash(lat, lon, 6);
const neighbors = plugin.getNeighbors(centerHash);
const searchHashes = [centerHash, ...neighbors];  // 9 cells total

// Query all relevant cells
const candidates = await Promise.all(
  searchHashes.map(hash =>
    stores.listPartition({
      partition: 'byGeohash',
      partitionValues: { _geohash: hash }
    })
  )
);

// Flatten and filter by exact distance
const results = candidates
  .flat()
  .map(store => ({
    ...store,
    distance: plugin.calculateDistance(lat, lon, store.latitude, store.longitude)
  }))
  .filter(s => s.distance <= radiusKm)
  .sort((a, b) => a.distance - b.distance);
```

**What you get:** No missing results near geohash boundaries.

---

## Level 5: Production Optimization

Combine techniques for maximum performance:

```javascript
// 1. Use multiple partitions for complex queries
const stores = await db.createResource({
  name: 'stores',
  attributes: {
    city: 'string',
    latitude: 'number',
    longitude: 'number',
    _geohash: 'string'
  },
  partitions: {
    byCity: { fields: { city: 'string' } },      // Filter by city first
    byGeohash: { fields: { _geohash: 'string' } } // Then by location
  }
});

// 2. Filter by city, then proximity
const cityStores = await stores.listPartition({
  partition: 'byCity',
  partitionValues: { city: 'Sao Paulo' }
});

const nearby = cityStores
  .map(s => ({
    ...s,
    distance: plugin.calculateDistance(lat, lon, s.latitude, s.longitude)
  }))
  .filter(s => s.distance <= 10)
  .sort((a, b) => a.distance - b.distance)
  .slice(0, 20);

// 3. Cache frequent searches
const cacheKey = `nearby:${lat}:${lon}:${radius}`;
const cached = await cache.get(cacheKey);
if (cached) return cached;

const results = await stores.findNearby({ lat, lon, radius });
await cache.set(cacheKey, results, { ttl: 300 }); // 5min cache
```

**What you get:** Production-ready performance with caching and multi-partition filtering.

---

## Bounding Box Queries

Find locations within a rectangular area (useful for map viewports):

```javascript
const inBounds = await stores.findInBounds({
  north: -23.5,
  south: -23.6,
  east: -46.6,
  west: -46.7
});
```

---

## Distance Calculations

Calculate distance between two records:

```javascript
const result = await stores.getDistance('store-1', 'store-2');
console.log(`Distance: ${result.distance} ${result.unit}`);
```

Or calculate directly from coordinates:

```javascript
const distance = plugin.calculateDistance(
  40.7128, -74.0060,  // New York
  51.5074, -0.1278    // London
);
// 5570.24 km
```

---

## Dynamic Precision Adjustment

Adjust precision based on zoom level:

```javascript
function getPrecisionForZoom(zoomLevel) {
  const precisionMap = {
    world: 2,    // zoom 0-3
    country: 3,  // zoom 4-5
    region: 4,   // zoom 6-7
    city: 5,     // zoom 8-10
    local: 6,    // zoom 11-13
    street: 7    // zoom 14-16
  };

  if (zoomLevel >= 14) return precisionMap.street;
  if (zoomLevel >= 11) return precisionMap.local;
  if (zoomLevel >= 8) return precisionMap.city;
  if (zoomLevel >= 6) return precisionMap.region;
  if (zoomLevel >= 4) return precisionMap.country;
  return precisionMap.world;
}
```

---

## Integration with Maps

Convert results to GeoJSON for map libraries:

```javascript
const bounds = {
  north: -23.5,
  south: -23.6,
  east: -46.6,
  west: -46.7
};

const locations = await stores.findInBounds(bounds);

// Return GeoJSON for map libraries
const geoJSON = {
  type: 'FeatureCollection',
  features: locations.map(loc => ({
    type: 'Feature',
    geometry: {
      type: 'Point',
      coordinates: [loc.longitude, loc.latitude]
    },
    properties: {
      name: loc.name,
      id: loc.id
    }
  }))
};
```

---

## Combining with Filters

Use proximity search with additional filters:

```javascript
const nearby = await stores.findNearby({
  lat: -23.5505,
  lon: -46.6333,
  radius: 5,
  filter: {
    isOpen: true,
    rating: { $gte: 4.0 }
  }
});
```

---

## See Also

- [Configuration](./configuration.md) - All options and API reference
- [Best Practices](./best-practices.md) - Performance tips and FAQ
