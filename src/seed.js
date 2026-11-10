// Script aparte (no es una ruta de la API) para poblar datos de prueba
// de un solo jalon. Se corre con "npm run seed", no con npm start.
require('dotenv').config();
const { createClient } = require('redis');

async function seed() {
  const client = createClient({ url: process.env.REDIS_URL });
  await client.connect();

  const eventId = 'evt-001';
  // Borro lo que haya antes para que cada corrida deje todo limpio
  // (si no hiciera esto, correr el seed varias veces iria sumando asientos duplicados).
  await client.del(`event:${eventId}`, `event:${eventId}:seats`);

  await client.hSet(`event:${eventId}`, {
    name: 'Concierto Rock en la Nube',
    venue: 'Auditorio Anahuac',
    date: '2026-12-15T20:00:00',
    price: '450',
  });

  // 2 secciones de asientos: A (3 filas x 5) y B (2 filas x 5) = 25 asientos.
  const sections = [
    { section: 'A', rows: 3, seatsPerRow: 5 },
    { section: 'B', rows: 2, seatsPerRow: 5 },
  ];

  const multi = client.multi();
  for (const s of sections) {
    for (let r = 1; r <= s.rows; r++) {
      for (let n = 1; n <= s.seatsPerRow; n++) {
        const seatId = `${s.section}${r}-${n}`;
        multi.hSet(`seat:${eventId}:${seatId}`, { status: 'available', section: s.section, row: String(r) });
        multi.sAdd(`event:${eventId}:seats`, seatId);
      }
    }
  }
  await multi.exec();

  console.log('Seed complete: event evt-001 with 25 seats created.');
  await client.quit();
}

seed().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
