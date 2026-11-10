// Esta es la parte MAS IMPORTANTE del proyecto: aqui vive el bloqueo
// temporal de asientos (el "hold" con TTL) que es el motivo por el que
// elegi Redis en vez de SQL. Todo lo demas del proyecto gira alrededor
// de este archivo.
const express = require('express');
const router = express.Router({ mergeParams: true });
const { client } = require('../config/redisClient');

// Cuantos segundos dura un bloqueo antes de liberarse solo (default 5 min).
// Se puede cambiar desde el .env sin tocar el codigo.
const HOLD_TTL_SECONDS = parseInt(process.env.HOLD_TTL_SECONDS || '300', 10);

const seatKey = (eventId, seatId) => `seat:${eventId}:${seatId}`;
const holdKey = (eventId, seatId) => `hold:${eventId}:${seatId}`;

// SEED: crea de golpe todos los asientos de un evento, organizados por
// secciones y filas (ej. seccion A, fila 1, asiento 1 => "A1-1").
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
        multi.hSet(seatKey(eventId, seatId), { status: 'disponible', section: s.section, row: String(r) });
        multi.sAdd(`event:${eventId}:seats`, seatId); // lo agrego tambien al Set del evento
        count++;
      }
    }
  }
  await multi.exec();
  res.status(201).json({ seatsCreated: count });
});

// READ (todos): lista los asientos y su estado actual.
router.get('/:eventId/seats', async (req, res) => {
  const { eventId } = req.params;
  const seatIds = await client.sMembers(`event:${eventId}:seats`);
  const seats = await Promise.all(
    seatIds.map(async (seatId) => ({ seatId, ...(await client.hGetAll(seatKey(eventId, seatId))) }))
  );
  res.json(seats);
});

// READ (uno): ademas del estado, regresa cuanto TTL le queda al hold (si
// esta bloqueado). Si holdTtlSeconds sale null es porque no hay bloqueo activo.
router.get('/:eventId/seats/:seatId', async (req, res) => {
  const { eventId, seatId } = req.params;
  const data = await client.hGetAll(seatKey(eventId, seatId));
  if (Object.keys(data).length === 0) return res.status(404).json({ error: 'Seat not found' });
  const ttl = await client.ttl(holdKey(eventId, seatId));
  res.json({ seatId, ...data, holdTtlSeconds: ttl > 0 ? ttl : null });
});

// HOLD: aqui esta el truco principal del proyecto. "SET ... NX EX" crea
// el bloqueo y su expiracion EN UNA SOLA OPERACION ATOMICA:
//   - NX = "solo si esta llave no existe todavia" (evita que dos clientes
//     se queden con el mismo asiento al mismo tiempo)
//   - EX = "borrate solo despues de X segundos" (el TTL, lo maneja Redis,
//     no mi codigo)
router.post('/:eventId/seats/:seatId/hold', async (req, res) => {
  const { eventId, seatId } = req.params;
  const { customerId } = req.body;
  if (!customerId) return res.status(400).json({ error: 'customerId is required' });

  const seat = await client.hGetAll(seatKey(eventId, seatId));
  if (Object.keys(seat).length === 0) return res.status(404).json({ error: 'Seat not found' });
  if (seat.status !== 'disponible') return res.status(409).json({ error: `Seat is ${seat.status}` });

  const acquired = await client.set(holdKey(eventId, seatId), customerId, { NX: true, EX: HOLD_TTL_SECONDS });
  if (!acquired) return res.status(409).json({ error: 'Seat is already held by someone else' });

  await client.hSet(seatKey(eventId, seatId), { status: 'bloqueado' });
  res.json({ seatId, status: 'bloqueado', expiresInSeconds: HOLD_TTL_SECONDS });
});

// CONFIRM: convierte el bloqueo temporal en una reservacion permanente
// (sin TTL). Valida que el hold siga vivo y que sea del mismo cliente
// que esta confirmando (si no, alguien mas podria "robarse" el asiento).
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
  await client.hSet(seatKey(eventId, seatId), { status: 'reservado' });
  await client.del(holdKey(eventId, seatId)); // ya no hace falta el hold temporal

  res.status(201).json({ bookingId, seatId, status: 'confirmed' });
});

// RELEASE: libera un hold a mano (sin esperar a que expire el TTL solo).
router.post('/:eventId/seats/:seatId/release', async (req, res) => {
  const { eventId, seatId } = req.params;
  await client.del(holdKey(eventId, seatId));
  await client.hSet(seatKey(eventId, seatId), { status: 'disponible' });
  res.json({ seatId, status: 'disponible' });
});

// WAITLIST (agregar): uso un Sorted Set para que Redis ordene solo la
// lista de espera por momento de llegada (score = timestamp).
router.post('/:eventId/waitlist', async (req, res) => {
  const { eventId } = req.params;
  const { customerId } = req.body;
  await client.zAdd(`waitlist:${eventId}`, { score: Date.now(), value: customerId });
  res.status(201).json({ eventId, customerId, added: true });
});

// WAITLIST (ver): la trae ya ordenada por quien llego primero.
router.get('/:eventId/waitlist', async (req, res) => {
  const { eventId } = req.params;
  const list = await client.zRangeWithScores(`waitlist:${eventId}`, 0, -1);
  res.json(list);
});

module.exports = router;
