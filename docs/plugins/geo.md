# 🌍 Geo Plugin

## ⚡ TLDR

**Location-based queries** with automatic geohash indexing, proximity search, and distance calculations.

**1 line to get started:**
```javascript
plugins: [new GeoPlugin({ resources: { stores: { latField: 'lat', lonField: 'lon', precision: 5 } } })]
```

**Key features:**
- ✅ Automatic geohash encoding/decoding
- ✅ Proximity search (find nearby locations)
- ✅ Bounding box queries
- ✅ Distance calculations (Haversine formula)
- ✅ Configurable precision per resource
- ✅ Geospatial neighbor finding

**When to use:**
- 📍 Store/restaurant locators
- 🚗 Ride-sharing/delivery apps
- 🏨 Hotel/property search
- 📦 Warehouse/distribution routing
- 🗺️ Location-based services

**Quick Example:**
```javascript
// Find stores within 10km
const nearby = await stores.findNearby({
  lat: -23.5505,
  lon: -46.6333,
  radius: 10
});

// Get distance between two stores
const distance = await stores.getDistance('store-1', 'store-2');
console.log(`Distance: ${distance.distance} ${distance.unit}`);
```

---

## 📋 Table of Contents

- [Overview](#overview)
- [Key Features](#key-features)
- [Installation & Setup](#installation--setup)
- [Configuration Options](#configuration-options)
- [Usage Examples](#usage-examples)
- [API Reference](#api-reference)
- [Geohash System](#geohash-system)
- [Performance Considerations](#performance-considerations)
- [Best Practices](#best-practices)

---

## Overview

The Geo Plugin adds geospatial capabilities to your S3DB resources, enabling location-based queries, proximity search, and distance calculations. It automatically encodes coordinates into geohashes for efficient spatial indexing and provides convenient methods for common geospatial operations.

### How It Works

1. **Automatic Geohash Encoding**: Converts latitude/longitude to geohash strings during insert/update
2. **Helper Methods**: Adds `findNearby()`, `findInBounds()`, and `getDistance()` to resources
3. **Distance Calculations**: Uses Haversine formula for accurate great-circle distances
4. **Neighbor Finding**: Calculates surrounding geohash cells for expanded searches

> 💡 **Perfect for Location Services**: Ideal for any application that needs to work with geographic coordinates and proximity.

---

## Key Features

### 🎯 Core Features
- **Proximity Search**: Find locations within a specified radius
- **Bounding Box Queries**: Find all locations within a rectangular area
- **Distance Calculations**: Calculate distance between any two coordinates
- **Automatic Geohash Encoding**: Converts coordinates to geohash automatically
- **Configurable Precision**: Set geohash precision per resource (1-12)

### 🔧 Technical Features
- **Haversine Formula**: Accurate great-circle distance calculations
- **Geohash System**: Base32 geohash encoding/decoding
- **Neighbor Calculation**: Find 8 surrounding geohash cells
- **Flexible Field Mapping**: Configure custom lat/lon field names
- **Optional Geohash Field**: Choose whether to persist geohash in records

---

## Installation & Setup

### Basic Setup

```javascript
import { S3db, GeoPlugin } from 's3db.js';

const s3db = new S3db({
  connectionString: "s3://ACCESS_KEY:SECRET_KEY@BUCKET_NAME/databases/myapp",
  plugins: [
    new GeoPlugin({
      resources: {
        stores: {
          latField: 'latitude',
          lonField: 'longitude',
          precision: 5,          // ~5km cells
          addGeohash: true      // Add 'geohash' field to records
        }
      }
    })
  ]
});

await s3db.connect();

// Use geospatial features
const stores = s3db.resource('stores');
await stores.insert({
  id: 'store-1',
  name: 'Downtown Store',
  latitude: -23.5505,
  longitude: -46.6333
});
```

### Multiple Resources

```javascript
new GeoPlugin({
  resources: {
    // Stores with 5km precision
    stores: {
      latField: 'latitude',
      lonField: 'longitude',
      precision: 5
    },

    // Restaurants with 1.2km precision
    restaurants: {
      latField: 'lat',
      lonField: 'lng',
      precision: 6,
      addGeohash: true
    },

    // Warehouses with 20km precision
    warehouses: {
      latField: 'coords_lat',
      lonField: 'coords_lon',
      precision: 4
    }
  },
  verbose: true  // Enable logging
})
```

---

## Configuration Options

### Plugin Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `resources` | Object | `{}` | Resource-specific geo configurations |
| `verbose` | Boolean | `false` | Enable detailed logging |

### Resource Configuration

| Option | Type | Required | Description |
|--------|------|----------|-------------|
| `latField` | String | ✅ Yes | Name of the latitude field |
| `lonField` | String | ✅ Yes | Name of the longitude field |
| `precision` | Number | No (default: 5) | Geohash precision (1-12) |
| `addGeohash` | Boolean | No (default: false) | Add 'geohash' field to records |

---

## Usage Examples

### Proximity Search

```javascript
// Find restaurants within 5km of a location
const nearby = await restaurants.findNearby({
  lat: -23.5505,
  lon: -46.6333,
  radius: 5,     // kilometers
  limit: 20      // max results
});

nearby.forEach(restaurant => {
  console.log(`${restaurant.name} - ${restaurant._distance.toFixed(2)}km away`);
});
```

### Bounding Box Queries

```javascript
// Find all locations within a rectangular area
const inArea = await stores.findInBounds({
  north: -23.5,
  south: -23.6,
  east: -46.6,
  west: -46.7,
  limit: 100
});

console.log(`Found ${inArea.length} stores in the area`);
```

### Distance Between Two Locations

```javascript
// Calculate distance between two stores
const distance = await stores.getDistance('store-1', 'store-2');

console.log(`Distance: ${distance.distance.toFixed(2)} ${distance.unit}`);
console.log(`From: ${distance.from}`);
console.log(`To: ${distance.to}`);
// Output: Distance: 357.42 km
```

### Manual Geohash Encoding/Decoding

```javascript
// Access the plugin instance
const geoPlugin = s3db.plugins.find(p => p.constructor.name === 'GeoPlugin');

// Encode coordinates to geohash
const geohash = geoPlugin.encodeGeohash(-23.5505, -46.6333, 5);
console.log('Geohash:', geohash); // '6gyf4'

// Decode geohash back to coordinates
const coords = geoPlugin.decodeGeohash('6gyf4');
console.log('Latitude:', coords.latitude);   // ~-23.55
console.log('Longitude:', coords.longitude); // ~-46.63
console.log('Error:', coords.error);         // Precision error margins
```

### Finding Neighboring Cells

```javascript
// Get 8 neighboring geohash cells
const neighbors = geoPlugin.getNeighbors('6gyf4');
console.log('Neighbors:', neighbors);
// ['6gyf1', '6gyf3', '6gyf5', '6gyf6', '6gyf7', '6gyfd', '6gyfe', '6gyfg']

// Use for expanded searches across cell boundaries
```

### Custom Distance Calculations

```javascript
// Calculate distance between any two coordinates
const distance = geoPlugin.calculateDistance(
  -23.5505, -46.6333, // São Paulo
  -22.9068, -43.1729  // Rio de Janeiro
);

console.log(`Distance: ${distance.toFixed(2)} km`); // ~357.42 km
```

---

## API Reference

### Resource Methods

These methods are added to resources configured with GeoPlugin:

#### `findNearby(options)`

Find locations within a radius of a point.

**Parameters:**
- `options.lat` (Number, required): Center latitude
- `options.lon` (Number, required): Center longitude
- `options.radius` (Number, default: 10): Search radius in kilometers
- `options.limit` (Number, default: 100): Maximum results to return

**Returns:** Array of records with `_distance` field (in km), sorted by distance

```javascript
const nearby = await resource.findNearby({
  lat: 40.7128,
  lon: -74.0060,
  radius: 15,
  limit: 50
});
```

#### `findInBounds(options)`

Find locations within a rectangular bounding box.

**Parameters:**
- `options.north` (Number, required): Northern boundary latitude
- `options.south` (Number, required): Southern boundary latitude
- `options.east` (Number, required): Eastern boundary longitude
- `options.west` (Number, required): Western boundary longitude
- `options.limit` (Number, default: 100): Maximum results to return

**Returns:** Array of records within the bounding box

```javascript
const inBounds = await resource.findInBounds({
  north: 40.8,
  south: 40.6,
  east: -73.9,
  west: -74.1,
  limit: 200
});
```

#### `getDistance(id1, id2)`

Calculate distance between two records.

**Parameters:**
- `id1` (String, required): ID of first record
- `id2` (String, required): ID of second record

**Returns:** Object with distance information

```javascript
const result = await resource.getDistance('location-1', 'location-2');
// {
//   distance: 357.42,
//   unit: 'km',
//   from: 'location-1',
//   to: 'location-2'
// }
```

### Plugin Methods

#### `encodeGeohash(latitude, longitude, precision)`

Encode coordinates to a geohash string.

**Parameters:**
- `latitude` (Number): Latitude (-90 to 90)
- `longitude` (Number): Longitude (-180 to 180)
- `precision` (Number): Geohash precision (1-12)

**Returns:** String (geohash)

```javascript
const geohash = plugin.encodeGeohash(-23.5505, -46.6333, 5);
// '6gyf4'
```

#### `decodeGeohash(geohash)`

Decode a geohash to coordinates.

**Parameters:**
- `geohash` (String): Geohash string to decode

**Returns:** Object with coordinates and error margins

```javascript
const coords = plugin.decodeGeohash('6gyf4');
// {
//   latitude: -23.550537109375,
//   longitude: -46.6333007812,
//   error: {
//     latitude: 0.02197265625,
//     longitude: 0.02197265625
//   }
// }
```

#### `calculateDistance(lat1, lon1, lat2, lon2)`

Calculate great-circle distance using Haversine formula.

**Parameters:**
- `lat1`, `lon1` (Number): First coordinate
- `lat2`, `lon2` (Number): Second coordinate

**Returns:** Number (distance in kilometers)

```javascript
const distance = plugin.calculateDistance(
  40.7128, -74.0060,  // New York
  51.5074, -0.1278    // London
);
// 5570.24 km
```

#### `getNeighbors(geohash)`

Get 8 neighboring geohash cells.

**Parameters:**
- `geohash` (String): Center geohash

**Returns:** Array of 8 geohash strings (surrounding cells)

```javascript
const neighbors = plugin.getNeighbors('6gyf4');
// [SW, S, SE, W, E, NW, N, NE]
```

#### `getStats()`

Get plugin statistics and configuration.

**Returns:** Object with plugin stats

```javascript
const stats = plugin.getStats();
// {
//   resources: 2,
//   configurations: [
//     {
//       resource: 'stores',
//       latField: 'latitude',
//       lonField: 'longitude',
//       precision: 5,
//       cellSize: '~4.9km'
//     },
//     ...
//   ]
// }
```

---

## Geohash System

### What is Geohash?

Geohash is a geocoding system that encodes geographic coordinates into a short string of letters and digits. Each character in the geohash represents a subdivision of the geographic space, making it efficient for spatial indexing.

### Precision Levels

| Precision | Cell Size | Use Case | Example |
|-----------|-----------|----------|---------|
| 1 | ~5000 km | Continental | Entire country |
| 2 | ~1250 km | Large regions | State/province |
| 3 | ~156 km | Metropolitan areas | City + suburbs |
| 4 | ~39 km (~20km) | City districts | Urban area |
| 5 | ~5 km | Neighborhoods | Delivery zones |
| 6 | ~1.2 km | Local search | Street blocks |
| 7 | ~150 m | Street-level | Building groups |
| 8 | ~38 m | Building-level | Individual buildings |
| 9 | ~4.7 m | Room-level | Indoor positioning |
| 10 | ~1.2 m | Very precise | Parking spots |
| 11 | ~15 cm | Centimeter precision | Object-level |
| 12 | ~3.7 cm | Sub-centimeter | Robotics |

### Choosing Precision

```javascript
// Large area search (cities, delivery zones)
precision: 5  // ~5km cells - good for city-wide services

// Neighborhood search (restaurants, stores)
precision: 6  // ~1.2km cells - good for local search

// Street-level search (exact locations)
precision: 7  // ~150m cells - good for navigation

// Building-level (addresses)
precision: 8  // ~38m cells - good for property search
```

### Geohash Properties

1. **Hierarchical**: Shorter geohashes represent larger areas
   ```
   6gyf4    - Full precision (5km cell)
   6gyf     - 4 characters (~39km cell)
   6gy      - 3 characters (~156km cell)
   ```

2. **Proximity**: Similar geohashes are geographically close
   ```
   6gyf4  ≈  6gyf5  (neighboring cells)
   6gyf4  ≠  7gyf4  (different regions)
   ```

3. **Efficient Indexing**: Can be used as partition keys
   ```javascript
   partitions: {
     byGeohash: {
       fields: { _geohash: 'string' }
     }
   }
   ```

---

## Performance Considerations

### Indexing Strategy

```javascript
// Use geohash precision matching your query patterns
const stores = await db.createResource({
  name: 'stores',
  attributes: {
    name: 'string',
    latitude: 'number',
    longitude: 'number',
    _geohash: 'string'
  },
  partitions: {
    byGeohash: {
      fields: { _geohash: 'string' }
    }
  }
});

// Plugin automatically populates _geohash field
await stores.insert({
  name: 'Store 1',
  latitude: -23.5505,
  longitude: -46.6333
  // _geohash: '6gyf4' added automatically
});

// Fast queries using partition
const nearbyStores = await stores.listPartition({
  partition: 'byGeohash',
  partitionValues: { _geohash: '6gyf4' }
});
```

### Query Optimization

```javascript
// ❌ Inefficient: Scans all records
const nearby = await stores.findNearby({
  lat: -23.5505,
  lon: -46.6333,
  radius: 5
});

// ✅ Better: Use geohash prefix for faster filtering
const geohashPrefix = geoPlugin.encodeGeohash(-23.5505, -46.6333, 4);
// Then query partition or filter by prefix

// ✅ Best: Combine with partition filtering
const inCell = await stores.listPartition({
  partition: 'byGeohash',
  partitionValues: { _geohash: geohashPrefix }
});
// Then calculate distances for final filtering
```

### Distance Calculation Performance

```javascript
// Haversine formula is computationally inexpensive
// ~1000 distance calculations per millisecond on modern CPUs

// For large result sets, consider:
// 1. Filter by bounding box first (cheap)
// 2. Calculate exact distances only for candidates
// 3. Sort and limit results

const candidates = await stores.findInBounds({
  north: centerLat + 0.1,
  south: centerLat - 0.1,
  east: centerLon + 0.1,
  west: centerLon - 0.1
});

// Then calculate exact distances
const withDistances = candidates.map(store => ({
  ...store,
  distance: plugin.calculateDistance(
    centerLat, centerLon,
    store.latitude, store.longitude
  )
})).filter(s => s.distance <= targetRadius);
```

---

## Best Practices

### 1. Choose Appropriate Precision

```javascript
// Match precision to your query patterns
{
  // City-wide delivery service
  deliveryZones: { precision: 5 },  // ~5km

  // Restaurant finder
  restaurants: { precision: 6 },    // ~1.2km

  // Street-level navigation
  addresses: { precision: 7 }       // ~150m
}
```

### 2. Use Consistent Field Names

```javascript
// Recommended: Use consistent naming across resources
const geoConfig = {
  latField: 'latitude',
  lonField: 'longitude',
  precision: 6
};

resources: {
  stores: geoConfig,
  restaurants: geoConfig,
  warehouses: geoConfig
}
```

### 3. Validate Coordinates

```javascript
// Validate before insert
function isValidCoordinate(lat, lon) {
  return lat >= -90 && lat <= 90 &&
         lon >= -180 && lon <= 180;
}

if (isValidCoordinate(data.latitude, data.longitude)) {
  await stores.insert(data);
} else {
  throw new Error('Invalid coordinates');
}
```

### 4. Handle Missing Coordinates

```javascript
// Hooks only add geohash if both coordinates exist
await stores.insert({
  name: 'Online Only Store',
  // No latitude/longitude
  // geohash will not be added
});

// Filter records with coordinates when querying
const locatedStores = stores.list().filter(s =>
  s.latitude !== undefined && s.longitude !== undefined
);
```

### 5. Combine with Partitioning

```javascript
// Use geohash for efficient spatial partitioning
const stores = await db.createResource({
  name: 'stores',
  attributes: {
    name: 'string',
    city: 'string',
    latitude: 'number',
    longitude: 'number',
    _geohash: 'string'
  },
  partitions: {
    byCity: { fields: { city: 'string' } },
    byGeohash: { fields: { _geohash: 'string' } }
  }
});

// Query by city first, then by proximity
const nycStores = await stores.listPartition({
  partition: 'byCity',
  partitionValues: { city: 'New York' }
});

const nearby = nycStores
  .map(store => ({
    ...store,
    distance: plugin.calculateDistance(
      userLat, userLon,
      store.latitude, store.longitude
    )
  }))
  .filter(s => s.distance <= 10)
  .sort((a, b) => a.distance - b.distance);
```

### 6. Error Handling

```javascript
try {
  const nearby = await stores.findNearby({
    lat: userLat,
    lon: userLon,
    radius: 10
  });
} catch (err) {
  if (err.message.includes('required')) {
    console.error('Invalid coordinates provided');
  } else {
    console.error('Proximity search failed:', err);
  }
}
```

### 7. Monitoring and Stats

```javascript
// Track plugin performance
const stats = geoPlugin.getStats();
console.log(`Geo-enabled resources: ${stats.resources}`);
stats.configurations.forEach(config => {
  console.log(`${config.resource}: ${config.cellSize} cells`);
});
```

---

## Advanced Usage

### Cross-Border Searches

```javascript
// When searching near geohash boundaries, include neighbors
const centerHash = plugin.encodeGeohash(lat, lon, 5);
const neighbors = plugin.getNeighbors(centerHash);
const searchHashes = [centerHash, ...neighbors];

// Query all relevant cells
const allCandidates = await Promise.all(
  searchHashes.map(hash =>
    stores.listPartition({
      partition: 'byGeohash',
      partitionValues: { _geohash: hash }
    })
  )
);

const allStores = allCandidates.flat();
// Then filter by exact distance
```

### Dynamic Precision Adjustment

```javascript
// Adjust precision based on zoom level or area
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

### Integration with Maps

```javascript
// Convert bounding box to coordinates for map display
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

## Examples

For complete working examples, see:
- [docs/examples/e45-geo-proximity-search.js](../examples/e45-geo-proximity-search.js)
- [docs/examples/e46-geo-bounding-box.js](../examples/e46-geo-bounding-box.js)
- [docs/examples/e47-geo-distance-calculations.js](../examples/e47-geo-distance-calculations.js)

---

## Related

- [Partitioning Guide](../guides/partitioning.md) - Use geohash for spatial partitioning
- [VectorPlugin](./vector.md) - For semantic similarity search
- [FulltextPlugin](./fulltext.md) - Combine with text search for "near me" queries
