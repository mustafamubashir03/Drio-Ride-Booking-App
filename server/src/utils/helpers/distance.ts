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

export function calculateFare(sourceLat: number, sourceLon: number, destLat: number, destLon: number) {
    const BASIC_FARE = 50;
    const PER_KM = 10;
    const distance = Math.round(calculateHaversineDistance(sourceLat, sourceLon, destLat, destLon) * 100) / 100;
    return Math.round((BASIC_FARE + PER_KM * distance) * 100) / 100;
}
