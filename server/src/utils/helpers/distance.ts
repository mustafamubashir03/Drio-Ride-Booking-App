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

export type RideCategory = 'mini' | 'go' | 'go-ac' | 'ac' | 'premium' | 'pro' | 'suv' | 'lux' | 'bike';

export const RIDE_CATEGORY_CONFIG: Record<RideCategory, { baseFare: number; perKm: number; perMin?: number; label: string; description?: string }> = {
    mini: { baseFare: 40, perKm: 9, label: 'Mini' },
    go: { baseFare: 45, perKm: 10, label: 'Go' },
    'go-ac': { baseFare: 55, perKm: 12, label: 'Go AC' },
    ac: { baseFare: 55, perKm: 12, label: 'Go AC' },
    premium: { baseFare: 70, perKm: 15, label: 'Premium' },
    pro: { baseFare: 90, perKm: 18, label: 'Pro' },
    suv: { baseFare: 95, perKm: 19, label: 'SUV' },
    lux: { baseFare: 120, perKm: 24, label: 'Lux' },
    bike: { baseFare: 25, perKm: 6, label: 'Bike' },
};

export function calculateFare(
    sourceLat: number,
    sourceLon: number,
    destLat: number,
    destLon: number,
    category: RideCategory = 'mini'
) {
    const cfg = RIDE_CATEGORY_CONFIG[category] || RIDE_CATEGORY_CONFIG.mini;
    const distance = Math.round(calculateHaversineDistance(sourceLat, sourceLon, destLat, destLon) * 100) / 100;
    const fare = Math.round((cfg.baseFare + cfg.perKm * Math.max(distance, 0.1)) * 100) / 100;
    return fare > 0 ? fare : cfg.baseFare + cfg.perKm * 0.1;
}
