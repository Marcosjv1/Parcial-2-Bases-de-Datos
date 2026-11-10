# Sistema de Reservacion de Boletos con Bloqueo Temporal de Asientos

Proyecto para el Parcial 2 — Desarrollo e Integracion de Aplicaciones con Bases de Datos NoSQL en la Nube.

Modelo NoSQL: **Clave-Valor**, sobre **Redis Cloud** (managed service).

## Requerimientos

- Node.js 18+
- Una base de datos Redis Cloud (free tier) ya creada
- npm

## Guia de instalacion

```bash
npm install
cp .env.example .env
# Edita .env y pega tu REDIS_URL real de Redis Cloud
```

## Poblar datos iniciales (seeding)

```bash
npm run seed
```

Esto crea el evento `evt-001` ("Concierto Rock en la Nube") con 25 asientos en dos secciones (A y B).

## Pasos para ejecutar la aplicacion

```bash
npm start
```

El servidor corre por defecto en `http://localhost:3000`.

## Endpoints principales

| Metodo | Ruta | Descripcion |
|---|---|---|
| POST | /events | Crear evento |
| GET | /events/:id | Leer evento (incluye total de asientos) |
| PUT | /events/:id | Actualizar evento |
| DELETE | /events/:id | Eliminar evento y todas sus llaves asociadas |
| POST | /events/:id/seats/seed | Generar asientos por secciones |
| GET | /events/:id/seats | Listar todos los asientos y su estado |
| GET | /events/:id/seats/:seatId | Ver un asiento (incluye TTL del hold si aplica) |
| POST | /events/:id/seats/:seatId/hold | Bloquear un asiento temporalmente (TTL) |
| POST | /events/:id/seats/:seatId/confirm | Confirmar un hold y generar una reservacion |
| POST | /events/:id/seats/:seatId/release | Liberar un hold manualmente |
| POST | /events/:id/waitlist | Agregar cliente a la lista de espera (Sorted Set) |
| GET | /events/:id/waitlist | Ver lista de espera ordenada por tiempo de solicitud |
| GET | /bookings/:id | Ver una reservacion |
| DELETE | /bookings/:id | Cancelar una reservacion (libera el asiento) |

## Flujo de prueba sugerido para la demo en vivo

```bash
curl -X POST http://localhost:3000/events/evt-001/seats/A1-1/hold \
  -H "Content-Type: application/json" \
  -d '{"customerId":"cust-123"}'

curl -X POST http://localhost:3000/events/evt-001/seats/A1-1/confirm \
  -H "Content-Type: application/json" \
  -d '{"customerId":"cust-123"}'

curl http://localhost:3000/events/evt-001/seats
```

## Diseno de datos (resumen)

Ver `DESIGN.md` para el documento completo de justificacion, arquitectura y catalogo de consultas.

## Frontend basico (opcional, solo para la demo)

Con el servidor corriendo (`npm start`), abre `http://localhost:3000/app` en el navegador para
una pagina simple con botones (ver asientos, bloquear, confirmar, liberar) que usa la misma API
de arriba. No es parte de la rubrica, es nomas un apoyo visual para la exposicion en vivo.
