# Geo Plugin

> **Geospatial indexing with geohash partitions, proximity search, and distance helpers.**

---

## TLDR

**Location-based queries** with automatic geohash indexing, proximity search, and distance calculations.

**1 line to get started:**
```javascript
await db.usePlugin(new GeoPlugin({ resources: { stores: { latField: 'lat', lonField: 'lon', precision: 6 } } }));
```

**Key features:**
- Automatic geohash encoding/decoding
- Proximity search (find nearby locations)
- Bounding box queries
- Distance calculations (Haversine formula)
- Configurable precision per resource
- Geospatial neighbor finding

**When to use:**
- Store/restaurant locators
- Ride-sharing/delivery apps
- Hotel/property search
- Warehouse/distribution routing
- Location-based services

**Performance:**
```javascript
// Naive: Load all 12,000 locations, calculate all distances
const all = await locations.list({ limit: 12000 }); // 4+ seconds

// Optimized: Geohash partitioning finds nearby in one query
const nearby = await locations.findNearby({ lat, lon, radius: 5 }); // ~180ms
// 20x faster, 99%+ cheaper
```

---

## Quick Start

```javascript
import { Database } from 's3db.js';
import { GeoPlugin } from 's3db.js';

const db = new Database({ connectionString: 's3://key:secret@bucket' });
await db.connect();

// Add GeoPlugin
await db.usePlugin(new GeoPlugin({
  resources: {
    stores: { latField: 'lat', lonField: 'lon', precision: 6 }
  }
}));

// Create resource with lat/lon fields
const stores = await db.createResource({
  name: 'stores',
  attributes: {
    name: 'string|required',
    lat: 'number|required',
    lon: 'number|required'
  }
});

// Insert location (geohash automatically added)
await stores.insert({
  name: 'Downtown Store',
  lat: -23.5505,
  lon: -46.6333
});

// Find nearby locations (5km radius)
const nearby = await stores.findNearby({
  lat: -23.5505,
  lon: -46.6333,
  radius: 5
});

console.log(`Found ${nearby.length} nearby stores`);
```

---

## Dependencies

**Zero external dependencies** - built into s3db.js core.

**What's Included:**
- Geohash encoding/decoding (built-in)
- Haversine distance formula (built-in)
- Neighbor calculation (built-in)
- Bounding box queries (built-in)
- Proximity search (built-in)

---

## Documentation Index

| Guide | Description |
|-------|-------------|
| [Configuration](./guides/configuration.md) | All options, geohash system, precision levels, API reference |
| [Usage Patterns](./guides/usage-patterns.md) | Progressive adoption, partitioning, advanced patterns |
| [Best Practices](./guides/best-practices.md) | Performance tips, validation, troubleshooting, FAQ |

---

## Quick Reference

### Core Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `resources` | Object | `{}` | Resource-specific geo configurations |
| `latField` | String | Required | Name of the latitude field |
| `lonField` | String | Required | Name of the longitude field |
| `precision` | Number | `6` | Geohash precision (1-12) |
| `addGeohash` | Boolean | `false` | Add 'geohash' field to records |

### Resource Methods

```javascript
// Find nearby locations
const nearby = await resource.findNearby({
  lat: 40.7128,
  lon: -74.0060,
  radius: 15,    // km
  limit: 50
});

// Find in bounding box
const inBounds = await resource.findInBounds({
  north: 40.8, south: 40.6,
  east: -73.9, west: -74.1
});

// Calculate distance between records
const result = await resource.getDistance('location-1', 'location-2');
// { distance: 357.42, unit: 'km' }
```

### Plugin Methods

```javascript
// Encode coordinates to geohash
const geohash = plugin.encodeGeohash(-23.5505, -46.6333, 5);
// '6gyf4'

// Calculate distance
const distance = plugin.calculateDistance(lat1, lon1, lat2, lon2);
// Returns distance in km

// Get neighboring cells
const neighbors = plugin.getNeighbors('6gyf4');
// [SW, S, SE, W, E, NW, N, NE]
```

### Precision Levels

| Precision | Cell Size | Use Case |
|-----------|-----------|----------|
| 4 | ~39 km | City districts |
| 5 | ~5 km | Neighborhoods |
| 6 | ~1.2 km | Local search (recommended) |
| 7 | ~150 m | Street-level |
| 8 | ~38 m | Building-level |

---

## How It Works

1. **Automatic Geohash Encoding**: Converts latitude/longitude to geohash strings during insert/update
2. **Helper Methods**: Adds `findNearby()`, `findInBounds()`, and `getDistance()` to resources
3. **Distance Calculations**: Uses Haversine formula for accurate great-circle distances
4. **Neighbor Finding**: Calculates surrounding geohash cells for expanded searches

---

## Partitioning for Speed

For large datasets (>1000 locations), add geohash partitioning:

```javascript
await db.usePlugin(new GeoPlugin({
  resources: {
    stores: {
      latField: 'latitude',
      lonField: 'longitude',
      precision: 6,
      addGeohash: true  // Adds '_geohash' field
    }
  }
}));

const stores = await db.createResource({
  name: 'stores',
  attributes: {
    latitude: 'number',
    longitude: 'number',
    _geohash: 'string'
  },
  partitions: {
    byGeohash: { fields: { _geohash: 'string' } }
  }
});
```

---

## See Also

- [Vector Plugin](../vector/README.md) - For semantic similarity search
- [FullText Plugin](../fulltext/README.md) - Combine with text search for "near me" queries
- [Partitioning Guide](../../guides/partitioning.md) - Use geohash for spatial partitioning
