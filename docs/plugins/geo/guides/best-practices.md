# Best Practices & FAQ

> **In this guide:** Performance tips, validation, troubleshooting, and FAQ.

**Navigation:** [← Back to Geo Plugin](../README.md) | [Configuration](./configuration.md)

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
import { ValidationError } from 's3db.js';

// Validate before insert
function isValidCoordinate(lat, lon) {
  return lat >= -90 && lat <= 90 &&
         lon >= -180 && lon <= 180;
}

if (isValidCoordinate(data.latitude, data.longitude)) {
  await stores.insert(data);
} else {
  throw new ValidationError('Invalid coordinates', {
    statusCode: 422,
    retriable: false,
    suggestion: 'Ensure latitude is in [-90, 90] and longitude is in [-180, 180]',
    metadata: { latitude: data.latitude, longitude: data.longitude }
  });
}
```

### 4. Handle Missing Coordinates

```javascript
// Hooks only add geohash if both coordinates exist
await stores.insert({
  name: 'Online Only Store',
  // No latitude/longitude - geohash will not be added
});

// Filter records with coordinates when querying
const locatedStores = stores.list().filter(s =>
  s.latitude !== undefined && s.longitude !== undefined
);
```

### 5. Combine with Partitioning

```javascript
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
    distance: plugin.calculateDistance(userLat, userLon, store.latitude, store.longitude)
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
  if (err.name === 'PluginError') {
    console.error('Status:', err.statusCode, 'Retriable?', err.retriable);
    console.error('Suggestion:', err.suggestion);
  }
}
```

### 7. Monitoring and Stats

```javascript
const stats = geoPlugin.getStats();
console.log(`Geo-enabled resources: ${stats.resources}`);
stats.configurations.forEach(config => {
  console.log(`${config.resource}: ${config.cellSize} cells`);
});
```

---

## Performance Considerations

### Indexing Strategy

```javascript
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
// Inefficient: Scans all records
const nearby = await stores.findNearby({
  lat: -23.5505,
  lon: -46.6333,
  radius: 5
});

// Better: Use geohash prefix for faster filtering
const geohashPrefix = geoPlugin.encodeGeohash(-23.5505, -46.6333, 4);

// Best: Combine with partition filtering
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

// For large result sets:
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

## FAQ

### For Developers

**Q: What geohash precision should I use?**
**A:** Depends on your use case:
- **Precision 4** (~39km) - Country/state level, very broad searches
- **Precision 5** (~5km) - City level, good for large urban areas
- **Precision 6** (~1.2km) - **Recommended default**, neighborhood level
- **Precision 7** (~150m) - Street level, very precise searches
- **Precision 8** (~38m) - Building level, ultra-precise

Higher precision = more accurate but slower queries. Start with 6 and adjust.

**Q: How do I combine geospatial search with other filters?**
**A:** Use `findNearby()` with additional filters:
```javascript
const nearby = await stores.findNearby({
  lat: -23.5505,
  lon: -46.6333,
  radius: 5,
  filter: { isOpen: true, rating: { $gte: 4.0 } }
});
```

**Q: Can I search by bounding box instead of radius?**
**A:** Yes! Use `findInBounds()`:
```javascript
const inBounds = await stores.findInBounds({
  north: -23.5, south: -23.6, east: -46.6, west: -46.7
});
```

**Q: How accurate are distance calculations?**
**A:** Very accurate! The Haversine formula accounts for Earth's curvature with ~0.5% error for most distances.

**Q: Can I use existing lat/lon fields?**
**A:** Yes! Configure the field names:
```javascript
new GeoPlugin({
  resources: {
    locations: {
      latField: 'myCustomLatField',
      lonField: 'myCustomLonField',
      precision: 6
    }
  }
})
```

**Q: How do I handle moving/updating locations?**
**A:** Update the lat/lon fields - geohash automatically updates:
```javascript
await stores.update('store-123', {
  lat: -23.5600,  // New location
  lon: -46.6400
});
// Geohash automatically recalculated!
```

### For AI Agents

**Q: What problem does this plugin solve?**
**A:** Enables efficient location-based queries (proximity search, bounding box, distance calculations) using automatic geohash indexing for spatial partitioning.

**Q: What are the minimum required parameters?**
**A:**
```javascript
new GeoPlugin({
  resources: {
    resourceName: {
      latField: 'latitude',   // Required
      lonField: 'longitude'   // Required
    }
  }
})
```

**Q: What are the default values?**
**A:**
```javascript
{
  resources: {},              // Required
  // Per-resource:
  latField: undefined,        // Required
  lonField: undefined,        // Required
  precision: 6,               // Default (~1.2km cells)
  geohashField: 'geohash'     // Auto-created field name
}
```

**Q: What methods are added to resources?**
**A:**
- `findNearby({ lat, lon, radius, filter? })` - Find locations within radius (km)
- `findInBounds({ north, south, east, west, filter? })` - Find locations in bounding box
- `getDistance(id1, id2)` - Calculate distance between two records (km)

**Q: How does geohash partitioning work?**
**A:**
1. Automatically adds a `geohash` field to each record
2. Encodes lat/lon to geohash string (e.g., "6gy3z4")
3. For nearby searches, calculates geohash cells to check
4. Uses partition queries to only fetch relevant geographic cells
5. Filters results by actual distance

This reduces S3 requests by 99%+ compared to scanning all records.

**Q: Can I use this without partitions?**
**A:** Yes, but performance will be slower. Without partitions:
- Plugin still adds geohash field
- `findNearby()` fetches all records, then filters
- Partitions recommended for >1000 locations

**Q: What coordinate systems are supported?**
**A:** Only WGS84 (standard GPS coordinates):
- Latitude: -90 to +90
- Longitude: -180 to +180
- Uses decimal degrees

---

## See Also

- [Configuration](./configuration.md) - All options and API reference
- [Usage Patterns](./usage-patterns.md) - Examples and progressive adoption
