# Configuration

> **In this guide:** All configuration options, geohash system, precision levels, and API reference.

**Navigation:** [← Back to Geo Plugin](../README.md)

---

## Plugin Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `resources` | Object | `{}` | Resource-specific geo configurations |
| `logLevel` | Boolean | `false` | Enable detailed logging |

---

## Resource Configuration

| Option | Type | Required | Description |
|--------|------|----------|-------------|
| `latField` | String | Yes | Name of the latitude field |
| `lonField` | String | Yes | Name of the longitude field |
| `precision` | Number | No (default: 6) | Geohash precision (1-12) |
| `addGeohash` | Boolean | No (default: false) | Add 'geohash' field to records |

**Example:**
```javascript
new GeoPlugin({
  resources: {
    stores: {
      latField: 'latitude',
      lonField: 'longitude',
      precision: 6,
      addGeohash: true
    }
  }
})
```

---

## Multiple Resources Configuration

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
  logLevel: 'debug'
})
```

---

## Geohash System

### What is Geohash?

Geohash is a geocoding system that encodes geographic coordinates into a short string of letters and digits. Each character represents a subdivision of geographic space, making it efficient for spatial indexing.

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

```javascript
const geohash = plugin.encodeGeohash(-23.5505, -46.6333, 5);
// '6gyf4'
```

#### `decodeGeohash(geohash)`

Decode a geohash to coordinates.

```javascript
const coords = plugin.decodeGeohash('6gyf4');
// {
//   latitude: -23.550537109375,
//   longitude: -46.6333007812,
//   error: { latitude: 0.02197, longitude: 0.02197 }
// }
```

#### `calculateDistance(lat1, lon1, lat2, lon2)`

Calculate great-circle distance using Haversine formula.

```javascript
const distance = plugin.calculateDistance(
  40.7128, -74.0060,  // New York
  51.5074, -0.1278    // London
);
// 5570.24 km
```

#### `getNeighbors(geohash)`

Get 8 neighboring geohash cells.

```javascript
const neighbors = plugin.getNeighbors('6gyf4');
// [SW, S, SE, W, E, NW, N, NE]
```

#### `getStats()`

Get plugin statistics and configuration.

```javascript
const stats = plugin.getStats();
// {
//   resources: 2,
//   configurations: [
//     { resource: 'stores', precision: 5, cellSize: '~4.9km' }
//   ]
// }
```

---

## Error Reference

| Scenario | Status | Message | Suggested fix |
|----------|--------|---------|---------------|
| Missing `lat`/`lon` in `findNearby` | 400 | `Latitude and longitude are required for findNearby()` | Supply both coordinates |
| Missing bounding box fields | 400 | `Bounding box requires north, south, east, west coordinates` | Provide all four boundaries |
| Distance between records missing coordinates | 422 | `One or both records are missing coordinates` | Populate lat/lon fields first |

---

## See Also

- [Usage Patterns](./usage-patterns.md) - Examples and progressive adoption
- [Best Practices](./best-practices.md) - Performance tips and FAQ
