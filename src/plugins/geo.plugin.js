import Plugin from "./plugin.class.js";
import tryFn from "../concerns/try-fn.js";

/**
 * GeoPlugin - Geospatial Queries and Location-Based Features
 *
 * Provides geospatial capabilities including proximity search, bounding box queries,
 * distance calculations, and automatic geohash partitioning for efficient location queries.
 *
 * === Features ===
 * - Automatic geohash calculation and indexing
 * - Proximity search (find nearby locations)
 * - Bounding box queries (find within area)
 * - Distance calculation between two points (Haversine formula)
 * - Configurable geohash precision per resource
 * - Automatic partition creation for efficient queries
 * - Support for latitude/longitude fields
 *
 * === Configuration Example ===
 *
 * new GeoPlugin({
 *   resources: {
 *     stores: {
 *       latField: 'latitude',      // Latitude field name
 *       lonField: 'longitude',     // Longitude field name
 *       precision: 5,              // Geohash precision (~5km cells)
 *       addGeohash: true,         // Add 'geohash' field automatically
 *       usePartitions: true,      // Create geohash partitions for efficient queries
 *       zoomLevels: [4, 5, 6, 7]  // Multi-zoom partitions (4=~20km, 5=~5km, 6=~1.2km, 7=~150m)
 *     },
 *
 *     restaurants: {
 *       latField: 'lat',
 *       lonField: 'lng',
 *       precision: 6,             // Higher precision (~1.2km cells)
 *       usePartitions: true,      // Enables O(1) geohash lookups
 *       zoomLevels: [5, 6, 7, 8]  // Fine-grained zooms for dense urban areas
 *     }
 *   }
 * })
 *
 * // With zoomLevels, queries auto-select optimal partition based on search radius:
 * // - Large radius (>10km): uses zoom4 (~20km cells)
 * // - Medium radius (2-10km): uses zoom5 (~5km cells)
 * // - Small radius (0.5-2km): uses zoom6 (~1.2km cells)
 * // - Precise radius (<0.5km): uses zoom7 (~150m cells)
 *
 * === Geohash Precision ===
 *
 * | Precision | Cell Size | Use Case |
 * |-----------|-----------|----------|
 * | 4 | ~20km | Country/state level |
 * | 5 | ~5km | City districts, delivery zones |
 * | 6 | ~1.2km | Neighborhoods, local search |
 * | 7 | ~150m | Street-level accuracy |
 * | 8 | ~38m | Building-level accuracy |
 *
 * === Helper Methods Added to Resources ===
 *
 * resource.findNearby({
 *   lat: -23.5505,
 *   lon: -46.6333,
 *   radius: 10,     // km
 *   limit: 20
 * })
 *
 * resource.findInBounds({
 *   north: -23.5,
 *   south: -23.6,
 *   east: -46.6,
 *   west: -46.7
 * })
 *
 * resource.getDistance(id1, id2)  // Returns distance in km
 */
class GeoPlugin extends Plugin {
  constructor(config = {}) {
    super(config);

    this.resources = config.resources || {};
    this.verbose = config.verbose !== undefined ? config.verbose : false;

    // Geohash base32 alphabet
    this.base32 = '0123456789bcdefghjkmnpqrstuvwxyz';
  }

  /**
   * Install the plugin
   */
  async install(database) {
    await super.install(database);

    // Validate and setup each resource
    for (const [resourceName, config] of Object.entries(this.resources)) {
      await this._setupResource(resourceName, config);
    }

    // Watch for resources created after plugin installation
    this.database.addHook('afterCreateResource', async (context) => {
      const { resource, config: resourceConfig } = context;
      const geoConfig = this.resources[resource.name];

      if (geoConfig) {
        await this._setupResource(resource.name, geoConfig);
      }
    });

    if (this.verbose) {
      console.log(`[GeoPlugin] Installed with ${Object.keys(this.resources).length} resources`);
    }

    this.emit('installed', {
      plugin: 'GeoPlugin',
      resources: Object.keys(this.resources)
    });
  }

  /**
   * Setup a resource with geo capabilities
   */
  async _setupResource(resourceName, config) {
    // Check if resource exists first
    if (!this.database.resources[resourceName]) {
      if (this.verbose) {
        console.warn(`[GeoPlugin] Resource "${resourceName}" not found, will setup when created`);
      }
      return;
    }

    const resource = this.database.resource(resourceName);
    if (!resource || typeof resource.addHook !== 'function') {
      if (this.verbose) {
        console.warn(`[GeoPlugin] Resource "${resourceName}" not found or invalid`);
      }
      return;
    }

    // Validate configuration
    if (!config.latField || !config.lonField) {
      throw new Error(
        `[GeoPlugin] Resource "${resourceName}" must have "latField" and "lonField" configured`
      );
    }

    if (!config.precision || config.precision < 1 || config.precision > 12) {
      config.precision = 5; // Default precision
    }

    // Store config on resource
    resource._geoConfig = config;

    // Add geohash fields to resource schema if not already present
    const currentAttributes = { ...resource.attributes };
    let attributesModified = false;

    if (config.addGeohash && !currentAttributes.geohash) {
      currentAttributes.geohash = { type: 'string' };
      attributesModified = true;
    }

    if (!currentAttributes._geohash) {
      currentAttributes._geohash = { type: 'string' };
      attributesModified = true;
    }

    // Update attributes if we added new fields
    if (attributesModified) {
      resource.updateAttributes(currentAttributes);
    }

    // Setup geohash partitions if enabled
    if (config.usePartitions) {
      await this._setupPartitions(resource, config);
    }

    // Add hooks for automatic geohash calculation
    this._addHooks(resource, config);

    // Add helper methods to resource
    this._addHelperMethods(resource, config);

    if (this.verbose) {
      console.log(
        `[GeoPlugin] Setup resource "${resourceName}" with precision ${config.precision} ` +
        `(~${this._getPrecisionDistance(config.precision)}km cells)` +
        (config.usePartitions ? ' [Partitions enabled]' : '')
      );
    }
  }

  /**
   * Setup geohash partitions for efficient spatial queries
   * Creates multiple zoom-level partitions if zoomLevels configured
   */
  async _setupPartitions(resource, config) {
    const updatedConfig = { ...resource.config };
    updatedConfig.partitions = updatedConfig.partitions || {};

    let partitionsCreated = 0;

    // If zoomLevels configured, create partition for each zoom level
    if (config.zoomLevels && Array.isArray(config.zoomLevels)) {
      for (const zoom of config.zoomLevels) {
        const partitionName = `byGeohashZoom${zoom}`;
        const fieldName = `_geohash_zoom${zoom}`;

        if (!updatedConfig.partitions[partitionName]) {
          // Add zoom-specific geohash field to attributes if not present (optional field)
          if (!resource.attributes[fieldName]) {
            resource.attributes[fieldName] = { type: 'string', required: false };
          }

          updatedConfig.partitions[partitionName] = {
            fields: {
              [fieldName]: 'string'
            }
          };

          partitionsCreated++;

          if (this.verbose) {
            console.log(
              `[GeoPlugin] Created ${partitionName} partition for "${resource.name}" ` +
              `(precision ${zoom}, ~${this._getPrecisionDistance(zoom)}km cells)`
            );
          }
        }
      }
    } else {
      // Legacy: single partition with default precision
      const hasGeohashPartition = resource.config.partitions &&
                                  resource.config.partitions.byGeohash;

      if (!hasGeohashPartition) {
        if (!resource.attributes._geohash) {
          resource.attributes._geohash = { type: 'string', required: false };
        }

        updatedConfig.partitions.byGeohash = {
          fields: {
            _geohash: 'string'
          }
        };

        partitionsCreated++;

        if (this.verbose) {
          console.log(`[GeoPlugin] Created byGeohash partition for "${resource.name}"`);
        }
      }
    }

    // Update resource config
    if (partitionsCreated > 0) {
      resource.config = updatedConfig;

      // Persist to metadata
      if (this.database.uploadMetadataFile) {
        await this.database.uploadMetadataFile();
      }
    }
  }

  /**
   * Add hooks to automatically calculate geohash at all zoom levels
   */
  _addHooks(resource, config) {
    const calculateGeohash = async (data) => {
      const lat = data[config.latField];
      const lon = data[config.lonField];

      if (lat !== undefined && lon !== undefined) {
        // Calculate geohash at default precision
        const geohash = this.encodeGeohash(lat, lon, config.precision);

        if (config.addGeohash) {
          data.geohash = geohash;
        }

        // If zoomLevels configured, calculate geohash for each zoom
        if (config.zoomLevels && Array.isArray(config.zoomLevels)) {
          for (const zoom of config.zoomLevels) {
            const zoomGeohash = this.encodeGeohash(lat, lon, zoom);
            data[`_geohash_zoom${zoom}`] = zoomGeohash;
          }
        } else {
          // Legacy: single geohash (always set _geohash for partition support)
          data._geohash = geohash;
        }
      }

      return data;
    };

    resource.addHook('beforeInsert', calculateGeohash);
    resource.addHook('beforeUpdate', calculateGeohash);
  }

  /**
   * Add helper methods to resource
   */
  _addHelperMethods(resource, config) {
    const plugin = this;

    /**
     * Find nearby locations within radius
     * Automatically selects optimal zoom level if multi-zoom enabled
     */
    resource.findNearby = async function({ lat, lon, radius = 10, limit = 100 }) {
      if (lat === undefined || lon === undefined) {
        throw new Error('lat and lon are required for findNearby');
      }

      let allRecords = [];

      // Use partitions if enabled for efficient queries
      if (config.usePartitions) {
        let partitionName, fieldName, precision;

        // Select optimal zoom if multi-zoom configured
        if (config.zoomLevels && config.zoomLevels.length > 0) {
          const optimalZoom = plugin._selectOptimalZoom(config.zoomLevels, radius);
          partitionName = `byGeohashZoom${optimalZoom}`;
          fieldName = `_geohash_zoom${optimalZoom}`;
          precision = optimalZoom;

          if (plugin.verbose) {
            console.log(
              `[GeoPlugin] Auto-selected zoom${optimalZoom} (${plugin._getPrecisionDistance(optimalZoom)}km cells) ` +
              `for ${radius}km radius query`
            );
          }
        } else {
          // Legacy single partition
          partitionName = 'byGeohash';
          fieldName = '_geohash';
          precision = config.precision;
        }

        // Check if partition exists
        if (this.config.partitions?.[partitionName]) {
          // Calculate center geohash at selected precision
          const centerGeohash = plugin.encodeGeohash(lat, lon, precision);

          // Get neighboring geohashes to cover the search area
          const neighbors = plugin.getNeighbors(centerGeohash);
          const geohashesToSearch = [centerGeohash, ...neighbors];

          // Query each geohash partition in parallel
          const partitionResults = await Promise.all(
            geohashesToSearch.map(async (geohash) => {
              const [ok, err, records] = await tryFn(async () => {
                return await this.listPartition({
                  partition: partitionName,
                  partitionValues: { [fieldName]: geohash },
                  limit: limit * 2
                });
              });

              return ok ? records : [];
            })
          );

          // Flatten results
          allRecords = partitionResults.flat();

          if (plugin.verbose) {
            console.log(
              `[GeoPlugin] findNearby searched ${geohashesToSearch.length} ${partitionName} partitions, ` +
              `found ${allRecords.length} candidates`
            );
          }
        } else {
          // Fallback to full scan if partition doesn't exist
          allRecords = await this.list({ limit: limit * 10 });
        }
      } else {
        // Fallback to full scan if partitions not enabled
        allRecords = await this.list({ limit: limit * 10 });
      }

      // Calculate distances and filter
      const withDistances = allRecords
        .map(record => {
          const recordLat = record[config.latField];
          const recordLon = record[config.lonField];

          if (recordLat === undefined || recordLon === undefined) {
            return null;
          }

          const distance = plugin.calculateDistance(lat, lon, recordLat, recordLon);

          return {
            ...record,
            _distance: distance
          };
        })
        .filter(record => record !== null && record._distance <= radius)
        .sort((a, b) => a._distance - b._distance)
        .slice(0, limit);

      return withDistances;
    };

    /**
     * Find locations within bounding box
     * Automatically selects optimal zoom level if multi-zoom enabled
     */
    resource.findInBounds = async function({ north, south, east, west, limit = 100 }) {
      if (north === undefined || south === undefined || east === undefined || west === undefined) {
        throw new Error('north, south, east, west are required for findInBounds');
      }

      let allRecords = [];

      // Use partitions if enabled for efficient queries
      if (config.usePartitions) {
        let partitionName, precision;

        // Select optimal zoom if multi-zoom configured
        if (config.zoomLevels && config.zoomLevels.length > 0) {
          // Calculate approximate diameter of bounding box for zoom selection
          const centerLat = (north + south) / 2;
          const centerLon = (east + west) / 2;
          const latRadius = plugin.calculateDistance(centerLat, centerLon, north, centerLon);
          const lonRadius = plugin.calculateDistance(centerLat, centerLon, centerLat, east);
          const approximateRadius = Math.max(latRadius, lonRadius);

          const optimalZoom = plugin._selectOptimalZoom(config.zoomLevels, approximateRadius);
          partitionName = `byGeohashZoom${optimalZoom}`;
          precision = optimalZoom;

          if (plugin.verbose) {
            console.log(
              `[GeoPlugin] Auto-selected zoom${optimalZoom} (${plugin._getPrecisionDistance(optimalZoom)}km cells) ` +
              `for ${approximateRadius.toFixed(1)}km bounding box`
            );
          }
        } else {
          // Legacy single partition
          partitionName = 'byGeohash';
          precision = config.precision;
        }

        // Check if partition exists
        if (this.config.partitions?.[partitionName]) {
          // Calculate all geohashes that cover the bounding box
          const geohashesToSearch = plugin._getGeohashesInBounds({
            north, south, east, west,
            precision
          });

          // Query each geohash partition in parallel
          const partitionResults = await Promise.all(
            geohashesToSearch.map(async (geohash) => {
              const [ok, err, records] = await tryFn(async () => {
                const fieldName = config.zoomLevels ? `_geohash_zoom${precision}` : '_geohash';
                return await this.listPartition({
                  partition: partitionName,
                  partitionValues: { [fieldName]: geohash },
                  limit: limit * 2
                });
              });

              return ok ? records : [];
            })
          );

          // Flatten results
          allRecords = partitionResults.flat();

          if (plugin.verbose) {
            console.log(
              `[GeoPlugin] findInBounds searched ${geohashesToSearch.length} ${partitionName} partitions, ` +
              `found ${allRecords.length} candidates`
            );
          }
        } else {
          // Fallback to full scan if partition doesn't exist
          allRecords = await this.list({ limit: limit * 10 });
        }
      } else {
        // Fallback to full scan if partitions not enabled
        allRecords = await this.list({ limit: limit * 10 });
      }

      // Filter by exact bounding box (geohash cells may extend beyond bounds)
      const inBounds = allRecords
        .filter(record => {
          const lat = record[config.latField];
          const lon = record[config.lonField];

          if (lat === undefined || lon === undefined) {
            return false;
          }

          return lat <= north && lat >= south && lon <= east && lon >= west;
        })
        .slice(0, limit);

      return inBounds;
    };

    /**
     * Get distance between two records
     */
    resource.getDistance = async function(id1, id2) {
      let record1, record2;

      try {
        [record1, record2] = await Promise.all([
          this.get(id1),
          this.get(id2)
        ]);
      } catch (err) {
        if (err.name === 'NoSuchKey' || err.message?.includes('No such key')) {
          throw new Error('One or both records not found');
        }
        throw err;
      }

      if (!record1 || !record2) {
        throw new Error('One or both records not found');
      }

      const lat1 = record1[config.latField];
      const lon1 = record1[config.lonField];
      const lat2 = record2[config.latField];
      const lon2 = record2[config.lonField];

      if (lat1 === undefined || lon1 === undefined || lat2 === undefined || lon2 === undefined) {
        throw new Error('One or both records missing coordinates');
      }

      const distance = plugin.calculateDistance(lat1, lon1, lat2, lon2);

      return {
        distance,
        unit: 'km',
        from: id1,
        to: id2
      };
    };
  }

  /**
   * Encode coordinates to geohash
   * @param {number} latitude - Latitude (-90 to 90)
   * @param {number} longitude - Longitude (-180 to 180)
   * @param {number} precision - Number of characters in geohash
   * @returns {string} Geohash string
   */
  encodeGeohash(latitude, longitude, precision = 5) {
    let idx = 0;
    let bit = 0;
    let evenBit = true;
    let geohash = '';

    let latMin = -90;
    let latMax = 90;
    let lonMin = -180;
    let lonMax = 180;

    while (geohash.length < precision) {
      if (evenBit) {
        // Longitude
        const lonMid = (lonMin + lonMax) / 2;
        if (longitude > lonMid) {
          idx |= (1 << (4 - bit));
          lonMin = lonMid;
        } else {
          lonMax = lonMid;
        }
      } else {
        // Latitude
        const latMid = (latMin + latMax) / 2;
        if (latitude > latMid) {
          idx |= (1 << (4 - bit));
          latMin = latMid;
        } else {
          latMax = latMid;
        }
      }

      evenBit = !evenBit;

      if (bit < 4) {
        bit++;
      } else {
        geohash += this.base32[idx];
        bit = 0;
        idx = 0;
      }
    }

    return geohash;
  }

  /**
   * Decode geohash to coordinates
   * @param {string} geohash - Geohash string
   * @returns {Object} { latitude, longitude, error }
   */
  decodeGeohash(geohash) {
    let evenBit = true;
    let latMin = -90;
    let latMax = 90;
    let lonMin = -180;
    let lonMax = 180;

    for (let i = 0; i < geohash.length; i++) {
      const chr = geohash[i];
      const idx = this.base32.indexOf(chr);

      if (idx === -1) {
        throw new Error(`Invalid geohash character: ${chr}`);
      }

      for (let n = 4; n >= 0; n--) {
        const bitN = (idx >> n) & 1;

        if (evenBit) {
          // Longitude
          const lonMid = (lonMin + lonMax) / 2;
          if (bitN === 1) {
            lonMin = lonMid;
          } else {
            lonMax = lonMid;
          }
        } else {
          // Latitude
          const latMid = (latMin + latMax) / 2;
          if (bitN === 1) {
            latMin = latMid;
          } else {
            latMax = latMid;
          }
        }

        evenBit = !evenBit;
      }
    }

    const latitude = (latMin + latMax) / 2;
    const longitude = (lonMin + lonMax) / 2;

    return {
      latitude,
      longitude,
      error: {
        latitude: latMax - latMin,
        longitude: lonMax - lonMin
      }
    };
  }

  /**
   * Calculate distance between two coordinates using Haversine formula
   * @param {number} lat1 - Latitude of point 1
   * @param {number} lon1 - Longitude of point 1
   * @param {number} lat2 - Latitude of point 2
   * @param {number} lon2 - Longitude of point 2
   * @returns {number} Distance in kilometers
   */
  calculateDistance(lat1, lon1, lat2, lon2) {
    const R = 6371; // Earth's radius in kilometers

    const dLat = this._toRadians(lat2 - lat1);
    const dLon = this._toRadians(lon2 - lon1);

    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(this._toRadians(lat1)) *
      Math.cos(this._toRadians(lat2)) *
      Math.sin(dLon / 2) * Math.sin(dLon / 2);

    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    return R * c;
  }

  /**
   * Get geohash neighbors (8 surrounding cells)
   * @param {string} geohash - Center geohash
   * @returns {Array<string>} Array of 8 neighboring geohashes
   */
  getNeighbors(geohash) {
    const decoded = this.decodeGeohash(geohash);
    const { latitude, longitude, error } = decoded;

    const latStep = error.latitude;
    const lonStep = error.longitude;

    const neighbors = [];

    // 8 directions
    const directions = [
      [-latStep, -lonStep], // SW
      [-latStep, 0],        // S
      [-latStep, lonStep],  // SE
      [0, -lonStep],        // W
      [0, lonStep],         // E
      [latStep, -lonStep],  // NW
      [latStep, 0],         // N
      [latStep, lonStep]    // NE
    ];

    for (const [latDelta, lonDelta] of directions) {
      const neighborHash = this.encodeGeohash(
        latitude + latDelta,
        longitude + lonDelta,
        geohash.length
      );
      neighbors.push(neighborHash);
    }

    return neighbors;
  }

  /**
   * Get all geohashes that cover a bounding box
   * @param {Object} bounds - Bounding box { north, south, east, west, precision }
   * @returns {Array<string>} Array of unique geohashes covering the area
   */
  _getGeohashesInBounds({ north, south, east, west, precision }) {
    const geohashes = new Set();

    // Calculate step size based on precision
    const cellSize = this._getPrecisionDistance(precision);
    // Convert km to degrees (rough approximation: 1 degree ≈ 111 km)
    const latStep = cellSize / 111;
    const lonStep = cellSize / (111 * Math.cos(this._toRadians((north + south) / 2)));

    // Generate grid of points and calculate their geohashes
    for (let lat = south; lat <= north; lat += latStep) {
      for (let lon = west; lon <= east; lon += lonStep) {
        const geohash = this.encodeGeohash(lat, lon, precision);
        geohashes.add(geohash);
      }
    }

    // Also add geohashes for the corners and edges to ensure full coverage
    const corners = [
      [north, west], [north, east],
      [south, west], [south, east],
      [(north + south) / 2, west], [(north + south) / 2, east],
      [north, (east + west) / 2], [south, (east + west) / 2]
    ];

    for (const [lat, lon] of corners) {
      const geohash = this.encodeGeohash(lat, lon, precision);
      geohashes.add(geohash);
    }

    return Array.from(geohashes);
  }

  /**
   * Convert degrees to radians
   */
  _toRadians(degrees) {
    return degrees * (Math.PI / 180);
  }

  /**
   * Get approximate cell size for precision level
   */
  _getPrecisionDistance(precision) {
    const distances = {
      1: 5000,
      2: 1250,
      3: 156,
      4: 39,
      5: 4.9,
      6: 1.2,
      7: 0.15,
      8: 0.038,
      9: 0.0047,
      10: 0.0012,
      11: 0.00015,
      12: 0.000037
    };

    return distances[precision] || 5;
  }

  /**
   * Select optimal zoom level based on search radius
   * @param {Array<number>} zoomLevels - Available zoom levels
   * @param {number} radiusKm - Search radius in kilometers
   * @returns {number} Optimal zoom precision
   */
  _selectOptimalZoom(zoomLevels, radiusKm) {
    if (!zoomLevels || zoomLevels.length === 0) {
      return null;
    }

    // Select zoom where cell size is approximately 2-3x smaller than radius
    // This gives good coverage without too many partitions to query
    const targetCellSize = radiusKm / 2.5;

    let bestZoom = zoomLevels[0];
    let bestDiff = Math.abs(this._getPrecisionDistance(bestZoom) - targetCellSize);

    for (const zoom of zoomLevels) {
      const cellSize = this._getPrecisionDistance(zoom);
      const diff = Math.abs(cellSize - targetCellSize);

      if (diff < bestDiff) {
        bestDiff = diff;
        bestZoom = zoom;
      }
    }

    return bestZoom;
  }

  /**
   * Get plugin statistics
   */
  getStats() {
    return {
      resources: Object.keys(this.resources).length,
      configurations: Object.entries(this.resources).map(([name, config]) => ({
        resource: name,
        latField: config.latField,
        lonField: config.lonField,
        precision: config.precision,
        cellSize: `~${this._getPrecisionDistance(config.precision)}km`
      }))
    };
  }

  /**
   * Uninstall the plugin
   */
  async uninstall() {
    if (this.verbose) {
      console.log('[GeoPlugin] Uninstalled');
    }

    this.emit('uninstalled', {
      plugin: 'GeoPlugin'
    });

    await super.uninstall();
  }
}

export default GeoPlugin;
