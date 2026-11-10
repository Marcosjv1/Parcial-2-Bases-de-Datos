// Aqui vive la conexion a Redis Cloud. La idea de tenerlo en su propio
// archivo es que cualquier ruta (events, seats, bookings) pueda importar
// el mismo "client" ya conectado, en vez de abrir una conexion nueva cada vez.
const { createClient } = require('redis');

// process.env.REDIS_URL viene del archivo .env (nunca se escribe la
// contrasena directo aqui en el codigo, por seguridad).
const client = createClient({
  url: process.env.REDIS_URL,
});

client.on('error', (err) => console.error('Redis Client Error', err));

async function connectRedis() {
  if (!client.isOpen) {
    await client.connect();
  }
  console.log('Connected to Redis Cloud');
  return client;
}

module.exports = { client, connectRedis };
