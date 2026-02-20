require('dotenv/config');
const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient();

const defaultUnits = [
  { name: 'unidad', abbreviation: 'unidad' },
  { name: 'gramos', abbreviation: 'g' },
  { name: 'kilogramos', abbreviation: 'kg' },
  { name: 'mililitros', abbreviation: 'ml' },
  { name: 'litros', abbreviation: 'L' },
  { name: 'paquete', abbreviation: 'paq' },
  { name: 'botella', abbreviation: 'bot' },
  { name: 'lata', abbreviation: 'lata' },
  { name: 'caja', abbreviation: 'caja' },
];

const defaultLocations = [
  { name: 'Nevera', description: 'Refrigerador principal' },
  { name: 'Congelador', description: 'Freezer' },
  { name: 'Despensa', description: 'Estante de alimentos secos' },
  { name: 'Alacena', description: 'Armario de cocina' },
];

async function main() {
  // Create admin user
  const username = 'admin';
  const password = 'admin';
  const passwordHash = await bcrypt.hash(password, 10);

  await prisma.user.upsert({
    where: { username },
    update: {},
    create: {
      username,
      passwordHash,
    },
  });

  // Create default units
  for (const unit of defaultUnits) {
    await prisma.unit.upsert({
      where: { name: unit.name },
      update: {},
      create: unit,
    });
  }

  // Create default locations
  for (const location of defaultLocations) {
    await prisma.location.upsert({
      where: { name: location.name },
      update: {},
      create: location,
    });
  }

  console.log('Seed completed successfully');
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
