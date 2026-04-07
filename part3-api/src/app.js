require('dotenv').config();
const express = require('express');
const alertsRouter = require('./routes/alerts');
const { authenticate } = require('./middleware/auth');

const app = express();

app.use(express.json());


app.use('/api', authenticate, alertsRouter);

app.use((req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`StockFlow API running on port ${PORT}`);
});

module.exports = app;
