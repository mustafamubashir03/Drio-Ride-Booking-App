export function calculateHaversineDistance(sourceLat: number, sourceLon: number, destLat: number, destLon: number) {
    const EARTH_RADIUS_KM = 6371;

    const toRadians = (degree: number) => (degree * Math.PI) / 180;

    const lat1 = toRadians(sourceLat);
    const lat2 = toRadians(destLat);
    const dLat = toRadians(destLat - sourceLat);
    const dLon = toRadians(destLon - sourceLon);

    const a = Math.sin(dLat / 2) ** 2 +
        Math.cos(lat1) * Math.cos(lat2) *
        Math.sin(dLon / 2) ** 2;

    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    return EARTH_RADIUS_KM * c;
}