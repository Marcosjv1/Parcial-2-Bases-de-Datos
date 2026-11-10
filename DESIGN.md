# Documento de Diseno y Justificacion
## Sistema de Reservacion de Boletos con Bloqueo Temporal de Asientos

> Borrador de contenido para el PDF requerido por la rubrica. Convertir a PDF una vez revisado/ajustado.

### 1. Introduccion y Dominio del Problema

Caso de uso: venta de boletos para eventos en vivo (conciertos, teatro, deportes), donde multiples
usuarios intentan reservar el mismo asiento simultaneamente. El sistema debe:
- Permitir "apartar" un asiento por un tiempo limitado mientras el cliente completa su pago.
- Liberar automaticamente el asiento si el pago no se confirma a tiempo (evitar asientos "fantasma").
- Soportar una lista de espera cuando el evento esta agotado.

### 2. Justificacion del Paradigma (Clave-Valor vs. Relacional)

Un SGBD relacional modelaria esto con tablas `events`, `seats`, `holds`, `bookings` y claves foraneas,
pero el patron critico aqui -- "este bloqueo expira solo en N segundos" -- no existe de forma nativa
en SQL: requeriria un job/cron externo que revise y borre holds vencidos, con riesgo de condiciones
de carrera (dos clientes confirmando el mismo asiento al mismo tiempo) y overhead de locking a nivel
de fila/tabla.

En un modelo Clave-Valor (Redis):
- El comando `SET ... NX EX <segundos>` crea el hold y su expiracion de forma **atomica**: si dos
  clientes intentan bloquear el mismo asiento al mismo milisegundo, solo uno obtiene la llave (NX =
  "solo si no existe"). No hace falta un semaforo aparte.
- La expiracion (TTL) la maneja el motor internamente; no se necesita un proceso externo que "limpie"
  holds vencidos.
- El acceso es por llave exacta (`seat:evt-001:A1-1`), el patron de acceso dominante en este dominio
  (no se necesitan joins complejos), por lo que la latencia de lectura/escritura es O(1) en vez del
  costo de un join relacional bajo alta concurrencia.
- El throughput de escritura (miles de intentos de reserva por segundo en un lanzamiento de boletos)
  es exactamente el caso de uso para el que Redis esta optimizado (in-memory, single-threaded event
  loop sin locks de fila).

### 3. Arquitectura de la Solucion

```
[Cliente / Postman / curl]
        |
        v
[Backend Node.js + Express]  --(SDK oficial "redis" v4, cliente async)-->  [Redis Cloud (managed)]
        |
        v
  Rutas: /events  /events/:id/seats  /bookings
```

- El backend nunca accede a Redis directamente desde el cliente: toda la logica de negocio
  (validar que el hold pertenece al cliente antes de confirmar, etc.) vive en el servidor Express.
- Las credenciales de conexion (`REDIS_URL`) se inyectan via variables de entorno (`.env`), nunca
  hardcodeadas en el codigo fuente.

### 4. Diseno del Modelo NoSQL (Clave-Valor)

**Convencion de nombres de llaves (namespacing):**

| Llave | Tipo Redis | Contenido |
|---|---|---|
| `event:{eventId}` | Hash | name, venue, date, price |
| `event:{eventId}:seats` | Set | ids de todos los asientos del evento |
| `seat:{eventId}:{seatId}` | Hash | status (disponible/bloqueado/reservado), section, row |
| `hold:{eventId}:{seatId}` | String + TTL | customerId que sostiene el bloqueo temporal |
| `booking:{bookingId}` | Hash | eventId, seatId, customerId, status, createdAt |
| `waitlist:{eventId}` | Sorted Set | customerId, score = timestamp de solicitud |

**Estrategia de expiracion (TTL):**
- `hold:{eventId}:{seatId}` se crea con `EX 300` (5 minutos configurables via `HOLD_TTL_SECONDS`).
- Si el cliente no confirma el pago en ese tiempo, Redis elimina la llave automaticamente y el
  asiento vuelve a quedar disponible para los demas (logica de "liberacion perezosa": el endpoint de
  lectura del asiento puede detectar que el hold ya no existe).

**Politica de persistencia:** Redis Cloud (free tier) se configura con snapshots periodicos (RDB) por
defecto del proveedor, suficiente para este caso de uso (los holds son intencionalmente efimeros; los
datos que importa conservar -- `event`, `seat`, `booking` -- no llevan TTL).

### 5. Catalogo de Consultas Clave (SDK "redis" para Node.js)

```js
// Crear un hold atomico con expiracion (TTL) -- la consulta especializada central del proyecto
await client.set(`hold:${eventId}:${seatId}`, customerId, { NX: true, EX: 300 });

// Verificar cuanto tiempo le queda a un hold
const ttl = await client.ttl(`hold:${eventId}:${seatId}`);

// Confirmar reservacion (Hash)
await client.hSet(`booking:${bookingId}`, { eventId, seatId, customerId, status: 'confirmed' });

// Agregar cliente a lista de espera (Sorted Set, ordenado por tiempo)
await client.zAdd(`waitlist:${eventId}`, { score: Date.now(), value: customerId });

// Leer lista de espera en orden de llegada
await client.zRangeWithScores(`waitlist:${eventId}`, 0, -1);
```

### 6. Pendientes antes del examen

- [ ] Crear la cuenta/instancia real en Redis Cloud y pegar la REDIS_URL en `.env`.
- [ ] Ejecutar `npm run seed` contra la instancia en la nube (no localhost) antes de la demo.
- [ ] Insertar el diagrama de bloques de la seccion 3 como imagen en el PDF final.
- [ ] Practicar explicar, sin leer: por que NX+EX resuelve condiciones de carrera que SQL no resuelve
      de forma nativa, y que pasa si el servidor Express se cae mientras un hold esta activo (Redis
      lo sigue expirando solo porque el TTL vive en el propio motor, no en el backend).
