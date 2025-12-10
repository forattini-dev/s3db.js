import { encode, decode } from './base62.js';
import { ValidationError } from '../errors.js';
export function encodeGeoLat(lat, precision = 6) {
    if (lat === null || lat === undefined)
        return lat;
    if (typeof lat !== 'number' || isNaN(lat))
        return lat;
    if (!isFinite(lat))
        return lat;
    if (lat < -90 || lat > 90) {
        throw new ValidationError('Latitude out of range', {
            field: 'lat',
            value: lat,
            min: -90,
            max: 90,
            statusCode: 400,
            retriable: false,
            suggestion: 'Provide a latitude between -90 and +90 degrees.'
        });
    }
    const normalized = lat + 90;
    const scale = Math.pow(10, precision);
    const scaled = Math.round(normalized * scale);
    return '~' + encode(scaled);
}
export function decodeGeoLat(encoded, precision = 6) {
    if (typeof encoded !== 'string')
        return encoded;
    if (!encoded.startsWith('~'))
        return encoded;
    const scaled = decode(encoded.slice(1));
    if (isNaN(scaled))
        return NaN;
    const scale = Math.pow(10, precision);
    const normalized = scaled / scale;
    return normalized - 90;
}
export function encodeGeoLon(lon, precision = 6) {
    if (lon === null || lon === undefined)
        return lon;
    if (typeof lon !== 'number' || isNaN(lon))
        return lon;
    if (!isFinite(lon))
        return lon;
    if (lon < -180 || lon > 180) {
        throw new ValidationError('Longitude out of range', {
            field: 'lon',
            value: lon,
            min: -180,
            max: 180,
            statusCode: 400,
            retriable: false,
            suggestion: 'Provide a longitude between -180 and +180 degrees.'
        });
    }
    const normalized = lon + 180;
    const scale = Math.pow(10, precision);
    const scaled = Math.round(normalized * scale);
    return '~' + encode(scaled);
}
export function decodeGeoLon(encoded, precision = 6) {
    if (typeof encoded !== 'string')
        return encoded;
    if (!encoded.startsWith('~'))
        return encoded;
    const scaled = decode(encoded.slice(1));
    if (isNaN(scaled))
        return NaN;
    const scale = Math.pow(10, precision);
    const normalized = scaled / scale;
    return normalized - 180;
}
export function encodeGeoPoint(lat, lon, precision = 6) {
    const latEncoded = encodeGeoLat(lat, precision);
    const lonEncoded = encodeGeoLon(lon, precision);
    return String(latEncoded) + String(lonEncoded);
}
export function decodeGeoPoint(encoded, precision = 6) {
    if (typeof encoded !== 'string')
        return { latitude: NaN, longitude: NaN };
    const parts = encoded.split('~').filter(p => p.length > 0);
    if (parts.length !== 2) {
        return { latitude: NaN, longitude: NaN };
    }
    const latitude = decodeGeoLat('~' + parts[0], precision);
    const longitude = decodeGeoLon('~' + parts[1], precision);
    return { latitude, longitude };
}
export function isValidCoordinate(lat, lon) {
    return (typeof lat === 'number' &&
        typeof lon === 'number' &&
        !isNaN(lat) &&
        !isNaN(lon) &&
        isFinite(lat) &&
        isFinite(lon) &&
        lat >= -90 &&
        lat <= 90 &&
        lon >= -180 &&
        lon <= 180);
}
export function getPrecisionForAccuracy(accuracyMeters) {
    if (accuracyMeters >= 111000)
        return 0;
    if (accuracyMeters >= 11000)
        return 1;
    if (accuracyMeters >= 1100)
        return 2;
    if (accuracyMeters >= 110)
        return 3;
    if (accuracyMeters >= 11)
        return 4;
    if (accuracyMeters >= 1.1)
        return 5;
    if (accuracyMeters >= 0.11)
        return 6;
    return 7;
}
export function getAccuracyForPrecision(precision) {
    const accuracies = {
        0: 111000,
        1: 11000,
        2: 1100,
        3: 110,
        4: 11,
        5: 1.1,
        6: 0.11,
        7: 0.011
    };
    return accuracies[precision] || 111000;
}
//# sourceMappingURL=geo-encoding.js.map