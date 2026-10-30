const express = require('express');
const router = express.Router({ mergeParams: true });
const { client } = require('../config/redisClient');

const HOLD_TTL_SECONDS = parseInt(process.env.HOLD_TTL_SECONDS || '300', 10);

const seatKey = (eventId, seatId) => `seat:${eventId}:${seatId}`;
const holdKey = (eventId, seatId) => `hold:${eventId}:${seatId}`;

router.post('/:eventId/seats/seed', async (req, res) => {
  const { eventId } = req.params;
  const { sections } = req.body;
  const exists = await client.exists(`event:${eventId}`);
  if (!exists) return res.status(404).json({ error: 'Event not found' });

  const multi = client.multi();
  let count = 0;
  for (const s of sections) {
    for (let r = 1; r <= s.rows; r++) {
      for (let n = 1; n <= s.seatsPerRow; n++) {
        const seatId = `${s.section}${r}-${n}`;
        multi.hSet(seatKey(eventId, seatId), { status: 'available', section: s.section, row: String(r) });
        multi.sAdd(`event:${eventId}:seats`, seatId);
        count++;
      }
    }
  }
  await multi.exec();
  res.status(201).json({ seatsCreated: count });
});

router.get('/:eventId/seats', async (req, res) => {
  const { eventId } = req.params;
  const seatIds = await client.sMembers(`event:${eventId}:seats`);
  const seats = await Promise.all(
    seatIds.map(async (seatId) => ({ seatId, ...(await client.hGetAll(seatKey(eventId, seatId))) }))
  );
  res.json(seats);
});

router.get('/:eventId/seats/:seatId', async (req, res) => {
  const { eventId, seatId } = req.params;
  const data = await client.hGetAll(seatKey(eventId, seatId));
  if (Object.keys(data).length === 0) return res.status(404).json({ error: 'Seat not found' });
  const ttl = await client.ttl(holdKey(eventId, seatId));
  res.json({ seatId, ...data, holdTtlSeconds: ttl > 0 ? ttl : null });
});

router.post('/:eventId/seats/:seatId/hold', async (req, res) => {
  const { eventId, seatId } = req.params;
  const { customerId } = req.body;
  if (!customerId) return res.status(400).json({ error: 'customerId is required' });

  const seat = await client.hGetAll(seatKey(eventId, seatId));
  if (Object.keys(seat).length === 0) return res.status(404).json({ error: 'Seat not found' });
  if (seat.status !== 'available') return res.status(409).json({ error: `Seat is ${seat.status}` });

  const acquired = await client.set(holdKey(eventId, seatId), customerId, { NX: true, EX: HOLD_TTL_SECONDS });
  if (!acquired) return res.status(409).json({ error: 'Seat is already held by someone else' });

  await client.hSet(seatKey(eventId, seatId), { status: 'held' });
  res.json({ seatId, status: 'held', expiresInSeconds: HOLD_TTL_SECONDS });
});

router.post('/:eventId/seats/:seatId/confirm', async (req, res) => {
  const { eventId, seatId } = req.params;
  const { customerId } = req.body;

  const holder = await client.get(holdKey(eventId, seatId));
  if (!holder) return res.status(410).json({ error: 'Hold expired or does not exist' });
  if (holder !== customerId) return res.status(403).json({ error: 'Hold belongs to another customer' });

  const bookingId = `${eventId}-${seatId}-${Date.now()}`;
  await client.hSet(`booking:${bookingId}`, {
    eventId, seatId, customerId, status: 'confirmed', createdAt: new Date().toISOString(),
  });
  await client.hSet(seatKey(eventId, seatId), { status: 'booked' });
  await client.del(holdKey(eventId, seatId));

  res.status(201).json({ bookingId, seatId, status: 'confirmed' });
});

router.post('/:eventId/seats/:seatId/release', async (req, res) => {
  const { eventId, seatId } = req.params;
  await client.del(holdKey(eventId, seatId));
  await client.hSet(seatKey(eventId, seatId), { status: 'available' });
  res.json({ seatId, status: 'available' });
});

router.post('/:eventId/waitlist', async (req, res) => {
  const { eventId } = req.params;
  const { customerId } = req.body;
  await client.zAdd(`waitlist:${eventId}`, { score: Date.now(), value: customerId });
  res.status(201).json({ eventId, customerId, added: true });
});

router.get('/:eventId/waitlist', async (req, res) => {
  const { eventId } = req.params;
  const list = await client.zRangeWithScores(`waitlist:${eventId}`, 0, -1);
  res.json(list);
});

module.exports = router;
