// Punto de entrada de la app. Aqui se arma el servidor Express, se conectan
// las rutas (events, seats, bookings) y se levanta el servidor solo
// despues de confirmar la conexion a Redis Cloud.
require('dotenv').config(); // carga las variables del archivo .env (REDIS_URL, PORT, etc.)
const path = require('path');
const express = require('express');
const { connectRedis } = require('./src/config/redisClient');
const eventsRouter = require('./src/routes/events');
const seatsRouter = require('./src/routes/seats');
const bookingsRouter = require('./src/routes/bookings');

const app = express();
app.use(express.json()); // para poder leer el "body" JSON de las peticiones POST/PUT

// Las dos primeras rutas comparten el prefijo /events (una es para el evento
// en si, la otra para los asientos de ese evento).
app.use('/events', eventsRouter);
app.use('/events', seatsRouter);
app.use('/bookings', bookingsRouter);

// Frontend muy basico (solo para la demo en vivo): una pagina HTML con botones
// que le pega a esta misma API. No es parte de la rubrica, es nomas un apoyo
// visual. Vive en /app/ para no chocar con la ruta "/" de abajo.
app.use('/app', express.static(path.join(__dirname, 'public')));

app.get('/', (req, res) => res.json({ status: 'ok', service: 'ticketing-nosql' }));

const PORT = process.env.PORT || 3000;

// Importante: el servidor solo empieza a escuchar peticiones DESPUES de
// lograr conectarse a Redis. Si Redis falla, la app ni siquiera arranca.
connectRedis().then(() => {
  app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
}).catch((err) => {
  console.error('Failed to connect to Redis:', err);
  process.exit(1);
});
