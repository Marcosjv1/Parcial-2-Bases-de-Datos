// Rutas para ver y cancelar reservaciones YA confirmadas (lo que se creo
// en seats.js al hacer /confirm). Esto ya no se relaciona con el TTL,
// porque una reservacion confirmada es permanente.
const express = require('express');
const router = express.Router();
const { client } = require('../config/redisClient');

// READ: trae una reservacion por su id.
router.get('/:id', async (req, res) => {
  const data = await client.hGetAll(`booking:${req.params.id}`);
  if (Object.keys(data).length === 0) return res.status(404).json({ error: 'Booking not found' });
  res.json({ id: req.params.id, ...data });
});

// DELETE: cancela la reservacion y, lo importante, regresa el asiento
// a estado "disponible" para que alguien mas lo pueda reservar despues.
router.delete('/:id', async (req, res) => {
  const key = `booking:${req.params.id}`;
  const data = await client.hGetAll(key);
  if (Object.keys(data).length === 0) return res.status(404).json({ error: 'Booking not found' });

  await client.hSet(`seat:${data.eventId}:${data.seatId}`, { status: 'disponible' });
  await client.del(key);
  res.json({ cancelled: req.params.id, seatReleased: data.seatId });
});

module.exports = router;
