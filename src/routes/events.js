// CRUD del "evento" en si (el concierto/show). Aqui NO se tocan los
// asientos individuales, eso vive en seats.js.
const express = require('express');
const router = express.Router();
const { client } = require('../config/redisClient');

// Pequeno helper para no repetir el nombre de la llave en cada funcion.
const eventKey = (id) => `event:${id}`;

// CREATE: guarda el evento como un Hash de Redis (name, venue, date, price).
router.post('/', async (req, res) => {
  const { id, name, venue, date, price } = req.body;
  if (!id || !name) return res.status(400).json({ error: 'id and name are required' });
  const exists = await client.exists(eventKey(id));
  if (exists) return res.status(409).json({ error: 'Event already exists' });
  await client.hSet(eventKey(id), { name, venue: venue || '', date: date || '', price: String(price || 0) });
  res.status(201).json({ id, name, venue, date, price });
});

// READ: trae los datos del evento + cuantos asientos tiene en total.
router.get('/:id', async (req, res) => {
  const data = await client.hGetAll(eventKey(req.params.id));
  if (Object.keys(data).length === 0) return res.status(404).json({ error: 'Event not found' });
  const seatIds = await client.sMembers(`event:${req.params.id}:seats`);
  res.json({ id: req.params.id, ...data, totalSeats: seatIds.length });
});

// UPDATE: solo actualiza los campos que manden en el body, no borra los demas.
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

// DELETE: borra el evento Y todo lo que depende de el (asientos, holds,
// waitlist). Si no se borra todo junto, quedarian llaves "huerfanas" en Redis.
router.delete('/:id', async (req, res) => {
  const { id } = req.params;
  const seatIds = await client.sMembers(`event:${id}:seats`);
  const multi = client.multi(); // agrupa varios comandos para mandarlos juntos
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
