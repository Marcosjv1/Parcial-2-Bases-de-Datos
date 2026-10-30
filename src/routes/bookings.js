const express = require('express');
const router = express.Router();
const { client } = require('../config/redisClient');

router.get('/:id', async (req, res) => {
  const data = await client.hGetAll(`booking:${req.params.id}`);
  if (Object.keys(data).length === 0) return res.status(404).json({ error: 'Booking not found' });
  res.json({ id: req.params.id, ...data });
});

router.delete('/:id', async (req, res) => {
  const key = `booking:${req.params.id}`;
  const data = await client.hGetAll(key);
  if (Object.keys(data).length === 0) return res.status(404).json({ error: 'Booking not found' });

  await client.hSet(`seat:${data.eventId}:${data.seatId}`, { status: 'available' });
  await client.del(key);
  res.json({ cancelled: req.params.id, seatReleased: data.seatId });
});

module.exports = router;
