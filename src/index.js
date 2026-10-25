const express = require('express');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

// Endpoint de salud: sirve para probar el despliegue, APIM y los certificados.
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'revisatec-ms-notifications',
    timestamp: Date.now(), // Epoch en milisegundos
  });
});

app.listen(PORT, () => {
  console.log(`MS3 escuchando en el puerto ${PORT}`);
});
