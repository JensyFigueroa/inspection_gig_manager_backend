const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const auth = require('../middleware/auth');

// ============================================
// User Registration
// ============================================
router.post('/register', async (req, res) => {
  try {
    const { fullName, email, password, role, station } = req.body;

    // OPTIMIZADO: usar lean() para verificación
    const existingUser = await User.findOne({ email }).lean();
    if (existingUser) {
      return res.status(400).json({ error: 'The email is already registered' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const user = new User({
      fullName,
      email,
      password: hashedPassword,
      role: role,
      station: station || ''
    });

    await user.save();

    const token = jwt.sign(
      { 
        userId: user._id, 
        email: user.email, 
        fullName: user.fullName,
        role: user.role,
        station: user.station
      },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.status(201).json({
      access_token: token,
      token_type: 'bearer',
      user: {
        id: user._id,
        fullName: user.fullName,
        email: user.email,
        role: user.role,
        station: user.station,
        created_at: user.createdAt
      }
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// Login - OPTIMIZADO
// ============================================
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    // OPTIMIZADO: solo traer campos necesarios
    const user = await User.findOne({ email })
      .select('_id fullName email password role station createdAt');
    
    if (!user) {
      return res.status(401).json({ error: 'Incorrect credentials' });
    }

    const isValidPassword = await bcrypt.compare(password, user.password);
    if (!isValidPassword) {
      return res.status(401).json({ error: 'Incorrect credentials' });
    }

    const token = jwt.sign(
      { 
        userId: user._id, 
        email: user.email, 
        fullName: user.fullName,
        role: user.role,
        station: user.station
      },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.json({
      access_token: token,
      token_type: 'bearer',
      user: {
        id: user._id,
        fullName: user.fullName,
        email: user.email,
        role: user.role,
        station: user.station,
        created_at: user.createdAt
      }
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// Get current user - OPTIMIZADO
// ============================================
router.get('/me', auth, async (req, res) => {
  try {
    // OPTIMIZADO: usar lean() para lectura
    const user = await User.findById(req.userId)
      .select('-password')
      .lean();
    
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json({
      id: user._id,
      fullName: user.fullName,
      email: user.email,
      role: user.role,
      station: user.station,
      created_at: user.createdAt
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// Get all users - OPTIMIZADO
// ============================================
router.get('/users', auth, async (req, res) => {
  try {
    const users = await User.find()
      .select('-password')
      .lean();
    res.json(users);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// Get workers of a specific station - OPTIMIZADO
// ============================================
router.get('/workers/:station', auth, async (req, res) => {
  try {
    const workers = await User.find({ 
      station: req.params.station,
      role: { $in: ['worker', 'lead'] }
    })
    .select('-password')
    .lean();
    
    res.json(workers);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
