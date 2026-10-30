const express = require('express');
const router = express.Router();
const { client } = require('../config/redisClient');

const eventKey = (id) => `event:${id}`;

router.post('/', async (req, res) => {
  const { id, name, venue, date, price } = req.body;
  if (!id || !name) return res.status(400).json({ error: 'id and name are required' });
  const exists = await client.exists(eventKey(id));
  if (exists) return res.status(409).json({ error: 'Event already exists' });
  await client.hSet(eventKey(id), { name, venue: venue || '', date: date || '', price: String(price || 0) });
  res.status(201).json({ id, name, venue, date, price });
});

router.get('/:id', async (req, res) => {
  const data = await client.hGetAll(eventKey(req.params.id));
  if (Object.keys(data).length === 0) return res.status(404).json({ error: 'Event not found' });
  const seatIds = await client.sMembers(`event:${req.params.id}:seats`);
  res.json({ id: req.params.id, ...data, totalSeats: seatIds.length });
});

router.put('/:id', async (req, res) => {
  const key = eventKey(req.params.id);
  const exists = await client.exists(key);
  if (!exists) return res.status(404).json({ error: 'Event not found' });
  const fields = {};
  ['name', 'venue', 'date', 'price'].forEach((f) => {
    if (req.body[f] !== undefined) fields[f] = String(req.body[f]);
  });
  if (Object.keys(fields).length) await client.hSet(key, fields);
  res.json({ id: req.params.id, updated: Object.keys(fields) });
});

router.delete('/:id', async (req, res) => {
  const { id } = req.params;
  const seatIds = await client.sMembers(`event:${id}:seats`);
  const multi = client.multi();
  seatIds.forEach((seatId) => {
    multi.del(`seat:${id}:${seatId}`);
    multi.del(`hold:${id}:${seatId}`);
  });
  multi.del(`event:${id}:seats`);
  multi.del(`waitlist:${id}`);
  multi.del(eventKey(id));
  await multi.exec();
  res.json({ deleted: id });
});

module.exports = router;
