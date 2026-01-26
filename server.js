const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
require('dotenv').config();

const authRoutes = require('./routes/auth');
const gigRoutes = require('./routes/gigs');
const operatorRoutes = require('./routes/operators');
const usersRoutes = require('./routes/users');

const app = express();

// Middleware
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// Connect to MongoDB (WITHOUT the deprecated options)
mongoose.connect(process.env.MONGODB_URI)
.then(() => console.log('✅ Conect to MongoDB'))
.catch(err => console.error('❌ MongoDB connection error:', err));

// Rutas
app.use('/api/auth', authRoutes);
app.use('/api/gigs', gigRoutes);
app.use('/api/operators', operatorRoutes);
app.use('/api/users', usersRoutes);

// Ruta de prueba
app.get('/', (req, res) => {
  res.json({ message: 'API Gig Manager is working.' });
});

// Iniciar servidor
const PORT = process.env.PORT || 8001;
app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
});