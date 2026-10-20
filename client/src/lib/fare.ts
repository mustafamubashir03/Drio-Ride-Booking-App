export type RideCategory = 
  | 'mini' 
  | 'go' 
  | 'premium' 
  | 'pro' 
  | 'suv' 
  | 'lux' 
  | 'bike';

export const RIDE_CATEGORY_CONFIG: Record<RideCategory, { baseFare: number; perKm: number; label: string; description?: string }> = {
  mini: { baseFare: 40, perKm: 9, label: 'Mini', description: 'Affordable · Everyday' },
  go: { baseFare: 45, perKm: 10, label: 'Go', description: 'Comfort · AC' },
  premium: { baseFare: 70, perKm: 15, label: 'Premium', description: 'Premium · Quiet' },
  pro: { baseFare: 90, perKm: 18, label: 'Pro', description: 'Executive · Premium' },
  suv: { baseFare: 95, perKm: 19, label: 'SUV', description: 'Spacious · Family' },
  lux: { baseFare: 120, perKm: 24, label: 'Lux', description: 'Luxury · Top' },
  bike: { baseFare: 25, perKm: 6, label: 'Bike', description: 'Fast · Affordable' },
};

export function calculateFare(distanceKm: number, category: RideCategory = 'mini'): number {
  const cfg = RIDE_CATEGORY_CONFIG[category] ?? RIDE_CATEGORY_CONFIG.mini;
  const distance = Math.max(0.1, Math.round(distanceKm * 100) / 100);
  const fare = Math.round((cfg.baseFare + cfg.perKm * distance) * 100) / 100;
  return fare > 0 ? fare : cfg.baseFare + cfg.perKm * 0.1;
}

export function getCategoryConfig(category: RideCategory) {
  return RIDE_CATEGORY_CONFIG[category] ?? RIDE_CATEGORY_CONFIG.mini;
}