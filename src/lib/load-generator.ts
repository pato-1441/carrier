import { faker } from "@faker-js/faker";

import type { Load } from "../types.js";

const EQUIPMENT_TYPES = [
  "Dry Van",
  "Reefer",
  "Flatbed",
  "Step Deck",
  "Power Only",
];

const COMMODITY_TYPES = [
  "Electronics",
  "Produce",
  "Paper Goods",
  "Building Materials",
  "Automotive Parts",
  "Packaged Foods",
];

export function buildLoadFromReference(referenceNumber: string): Load {
  faker.seed(seedFromReference(referenceNumber));

  const pickupDate = faker.date.soon({ days: 10 });
  const deliveryDate = faker.date.between({
    from: new Date(pickupDate.getTime() + 6 * 60 * 60 * 1000),
    to: new Date(pickupDate.getTime() + 4 * 24 * 60 * 60 * 1000),
  });

  return {
    load_id: referenceNumber,
    origin: `${faker.location.city()}, ${faker.location.state({ abbreviated: true })}`,
    destination: `${faker.location.city()}, ${faker.location.state({ abbreviated: true })}`,
    pickup_datetime: pickupDate.toISOString(),
    delivery_datetime: deliveryDate.toISOString(),
    equipment_type: faker.helpers.arrayElement(EQUIPMENT_TYPES),
    loadboard_rate: faker.number.int({ min: 1200, max: 4800 }),
    notes: faker.helpers.arrayElement([
      "Must track with Macropoint.",
      "Driver assist at receiver.",
      "No hazmat. Food-grade trailer preferred.",
      "Appointment required for pickup and delivery.",
      "Tarps not required.",
    ]),
    weight: faker.number.int({ min: 5000, max: 45000 }),
    commodity_type: faker.helpers.arrayElement(COMMODITY_TYPES),
  };
}

function seedFromReference(referenceNumber: string): number {
  return [...referenceNumber].reduce((accumulator, char, index) => {
    return accumulator + char.charCodeAt(0) * (index + 1);
  }, 0);
}
