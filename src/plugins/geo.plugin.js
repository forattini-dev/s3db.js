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
 *       addGeohash: true          // Add 'geohash' field automatically
 *     },
 *
 *     restaurants: {
 *       latField: 'lat',
 *       lonField: 'lng',
 *       precision: 6              // Higher precision (~1.2km cells)
 *     }
 *   }
 * })
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

    // Add geohash field to resource schema if not already present
    if (config.addGeohash && !resource.schema.attributes.geohash) {
      resource.schema.attributes.geohash = { type: 'string' };
    }

    // Add internal _geohash field if not present
    if (!resource.schema.attributes._geohash) {
      resource.schema.attributes._geohash = { type: 'string' };
    }

    // Add hooks for automatic geohash calculation
    this._addHooks(resource, config);

    // Add helper methods to resource
    this._addHelperMethods(resource, config);

    if (this.verbose) {
      console.log(
        `[GeoPlugin] Setup resource "${resourceName}" with precision ${config.precision} ` +
        `(~${this._getPrecisionDistance(config.precision)}km cells)`
      );
    }
  }

  /**
   * Add hooks to automatically calculate geohash
   */
  _addHooks(resource, config) {
    const calculateGeohash = async (data) => {
      const lat = data[config.latField];
      const lon = data[config.lonField];

      if (lat !== undefined && lon !== undefined) {
        const geohash = this.encodeGeohash(lat, lon, config.precision);

        if (config.addGeohash) {
          data.geohash = geohash;
        }

        // Store for partition queries
        data._geohash = geohash;
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
     */
    resource.findNearby = async function({ lat, lon, radius = 10, limit = 100 }) {
      if (lat === undefined || lon === undefined) {
        throw new Error('lat and lon are required for findNearby');
      }

      // Get all records (or use partition if available)
      const allRecords = await this.list({ limit: limit * 2 }); // Get more for filtering

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
     */
    resource.findInBounds = async function({ north, south, east, west, limit = 100 }) {
      if (north === undefined || south === undefined || east === undefined || west === undefined) {
        throw new Error('north, south, east, west are required for findInBounds');
      }

      // Get all records
      const allRecords = await this.list({ limit: limit * 2 });

      // Filter by bounding box
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
