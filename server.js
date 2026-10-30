require('dotenv').config();
const express = require('express');
const { connectRedis } = require('./src/config/redisClient');
const eventsRouter = require('./src/routes/events');
const seatsRouter = require('./src/routes/seats');
const bookingsRouter = require('./src/routes/bookings');

const app = express();
app.use(express.json());

app.use('/events', eventsRouter);
app.use('/events', seatsRouter);
app.use('/bookings', bookingsRouter);

app.get('/', (req, res) => res.json({ status: 'ok', service: 'ticketing-nosql' }));

const PORT = process.env.PORT || 3000;

connectRedis().then(() => {
  app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
}).catch((err) => {
  console.error('Failed to connect to Redis:', err);
  process.exit(1);
});
