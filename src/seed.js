require('dotenv').config();
const { createClient } = require('redis');

async function seed() {
  const client = createClient({ url: process.env.REDIS_URL });
  await client.connect();

  const eventId = 'evt-001';
  await client.del(`event:${eventId}`, `event:${eventId}:seats`);

  await client.hSet(`event:${eventId}`, {
    name: 'Concierto Rock en la Nube',
    venue: 'Auditorio Anahuac',
    date: '2026-12-15T20:00:00',
    price: '450',
  });

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
