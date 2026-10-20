export const CAR_MODELS = {
  mini: [
    { name: 'Toyota Corolla Altis', image: '/mini.png' },
    { name: 'Honda City', image: '/mini.png' },
    { name: 'Hyundai Verna', image: '/mini.png' },
    { name: 'Maruti Suzuki Ciaz', image: '/mini.png' },
    { name: 'Skoda Slavia', image: '/mini.png' },
    { name: 'Volkswagen Virtus', image: '/mini.png' },
  ],
  go: [
    { name: 'Toyota Corolla Altis', image: '/AC-go.png' },
    { name: 'Honda City', image: '/AC-go.png' },
    { name: 'Hyundai Verna', image: '/AC-go.png' },
  ],
  premium: [
    { name: 'Toyota Camry', image: '/premium.png' },
    { name: 'Honda Accord', image: '/premium.png' },
    { name: 'Hyundai Sonata', image: '/premium.png' },
    { name: 'Skoda Superb', image: '/premium.png' },
  ],
  pro: [
    { name: 'BMW 3 Series', image: '/pro.png' },
    { name: 'Mercedes C-Class', image: '/pro.png' },
    { name: 'Audi A4', image: '/pro.png' },
  ],
  suv: [
    { name: 'Toyota Fortuner', image: '/suv.png' },
    { name: 'Mahindra XUV700', image: '/suv.png' },
    { name: 'Hyundai Tucson', image: '/suv.png' },
    { name: 'MG Gloster', image: '/suv.png' },
  ],
  lux: [
    { name: 'BMW 5 Series', image: '/premium.png' },
    { name: 'Mercedes E-Class', image: '/premium.png' },
    { name: 'Audi A6', image: '/premium.png' },
  ],
  bike: [
    { name: 'Honda CB125F', image: '/bike.png' },
    { name: 'TVS Apache RTR 160', image: '/bike.png' },
    { name: 'Bajaj Pulsar NS160', image: '/bike.png' },
    { name: 'Yamaha FZ-S FI', image: '/bike.png' },
    { name: 'Royal Enfield Hunter 350', image: '/bike.png' },
  ],
} as const;

export const CAR_COLORS = [
  'White',
  'Black',
  'Silver',
  'Grey',
  'Red',
  'Blue',
  'Navy Blue',
  'Maroon',
  'Beige',
  'Pearl White',
  'Carbon Black',
  'Midnight Blue',
];

export function generateNumberPlate(): string {
  const states = ['MH', 'DL', 'KA', 'TN', 'AP', 'UP', 'GJ', 'RJ', 'WB', 'PB'];
  const state = states[Math.floor(Math.random() * states.length)];
  const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  const letter1 = letters[Math.floor(Math.random() * letters.length)];
  const letter2 = letters[Math.floor(Math.random() * letters.length)];
  const num = String(Math.floor(1000 + Math.random() * 9000));
  return `${state} ${letter1}${letter2} ${num}`;
}

export function getRandomCarDetails(vehicleType: string = 'mini') {
  const models = CAR_MODELS[vehicleType as keyof typeof CAR_MODELS] || CAR_MODELS.mini;
  const model = models[Math.floor(Math.random() * models.length)];
  const color = CAR_COLORS[Math.floor(Math.random() * CAR_COLORS.length)];
  const numberPlate = generateNumberPlate();
  
  return {
    vehicleName: model.name,
    vehicleColor: color,
    vehicleNumberPlate: numberPlate,
    vehicleImage: model.image,
  };
}