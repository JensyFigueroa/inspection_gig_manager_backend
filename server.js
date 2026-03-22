const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
require('dotenv').config();

// Importar keep-alive
const keepAlive = require('./utils/keepAlive');

// Importar rutas
const authRoutes = require('./routes/auth');
const gigRoutes = require('./routes/gigs');
const operatorRoutes = require('./routes/operators');
const usersRoutes = require('./routes/users');
const tasksRoutes = require('./routes/tasks');
const notificationsRoutes = require('./routes/notifications');
const suggestionsRoutes = require('./routes/suggestions');
const efficiencyRoutes = require('./routes/efficiency');

const app = express();

// ============================================
// MIDDLEWARE
// ============================================
app.use(cors({
  origin: process.env.FRONTEND_URL || '*',
  credentials: true
}));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// ============================================
// HEALTH CHECK ENDPOINT (para keep-alive)
// ============================================
app.get('/api/health', (req, res) => {
  res.status(200).json({ 
    status: 'ok', 
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
});

// ============================================
// CONFIGURACIÓN MONGODB OPTIMIZADA
// ============================================
const mongoURI = process.env.USE_ATLAS === 'true' 
  ? process.env.MONGO_URI_ATLAS 
  : process.env.MONGO_URI_LOCAL;

const mongoOptions = {
  maxPoolSize: 10,              // Máximo conexiones en pool
  minPoolSize: 2,               // Mínimo conexiones activas
  serverSelectionTimeoutMS: 5000,
  socketTimeoutMS: 45000,
  bufferCommands: false,        // No buffer si no hay conexión
};

// ============================================
// CONEXIÓN A MONGODB
// ============================================
mongoose.connect(mongoURI, mongoOptions)
  .then(async () => {
    console.log(`✅ Conectado a MongoDB (${process.env.USE_ATLAS === 'true' ? 'Atlas' : 'Local'})`);
    
    // CREAR ÍNDICES AUTOMÁTICAMENTE
    await createIndexes();
    
    // Iniciar servidor
    const PORT = process.env.PORT || 8001;
    app.listen(PORT, () => {
      console.log(`🚀 Server running on port ${PORT}`);
      
      // Iniciar keep-alive solo en producción
      if (process.env.NODE_ENV === 'production' && process.env.BACKEND_URL) {
        keepAlive(process.env.BACKEND_URL);
      }
    });
  })
  .catch(err => {
    console.error('❌ MongoDB connection error:', err);
    process.exit(1);
  });

// ============================================
// FUNCIÓN PARA CREAR ÍNDICES
// ============================================
async function createIndexes() {
  try {
    const Gig = require('./models/Gig');
    const Notification = require('./models/Notification');
    const User = require('./models/User');

    // Índices para Gigs
    await Gig.collection.createIndex({ station: 1 });
    await Gig.collection.createIndex({ status: 1 });
    await Gig.collection.createIndex({ truckNumber: 1 });
    await Gig.collection.createIndex({ createdAt: -1 });
    await Gig.collection.createIndex({ station: 1, status: 1 });
    await Gig.collection.createIndex({ createdAt: 1 }); // Para DPU tracker

    // Índices para Notifications
    await Notification.collection.createIndex({ station: 1, targetRole: 1, isRead: 1 });
    await Notification.collection.createIndex({ isRead: 1 });
    await Notification.collection.createIndex({ createdAt: -1 });

    // Índices para Users
    await User.collection.createIndex({ email: 1 }, { unique: true });
    await User.collection.createIndex({ station: 1, role: 1 });

    console.log('✅ Índices de MongoDB creados/verificados');
  } catch (error) {
    console.log('⚠️ Error creando índices (pueden ya existir):', error.message);
  }
}

// ============================================
// RUTAS
// ============================================
app.use('/api/auth', authRoutes);
app.use('/api/gigs', gigRoutes);
app.use('/api/operators', operatorRoutes);
app.use('/api/users', usersRoutes);
app.use('/api/tasks', tasksRoutes);
app.use('/api/notifications', notificationsRoutes);
app.use('/api/suggestions', suggestionsRoutes);
app.use('/api/efficiency', efficiencyRoutes);

// Ruta raíz
app.get('/', (req, res) => {
  res.json({ message: 'API Gig Manager is working.' });
});

// ============================================
// MANEJO DE ERRORES GLOBAL
// ============================================
app.use((err, req, res, next) => {
  console.error('Error:', err);
  res.status(500).json({ error: 'Internal server error' });
});
