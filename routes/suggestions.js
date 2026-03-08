const express = require('express');
const router = express.Router();
const GigDescription = require('../models/GigDescription');
const Operator = require('../models/Operator');
const auth = require('../middleware/auth');

// Buscar sugerencias de descripciones de gigs
router.get('/gig-descriptions', auth, async (req, res) => {
  try {
    const { query, station } = req.query;
    
    if (!query || query.length < 2) {
      return res.json([]);
    }

    const searchQuery = {
      description: { $regex: query, $options: 'i' }
    };

    // Opcional: filtrar por estación
    if (station) {
      searchQuery.$or = [
        { station: station },
        { station: { $exists: false } },
        { station: '' }
      ];
    }

    const suggestions = await GigDescription.find(searchQuery)
      .sort({ usageCount: -1, lastUsed: -1 })
      .limit(10);

    res.json(suggestions);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Agregar o actualizar descripción de gig
router.post('/gig-descriptions', auth, async (req, res) => {
  try {
    const { description, station } = req.body;

    if (!description || description.trim().length < 3) {
      return res.status(400).json({ error: 'Description too short' });
    }

    const existing = await GigDescription.findOne({ 
      description: { $regex: `^${description.trim()}$`, $options: 'i' }
    });

    if (existing) {
      existing.usageCount += 1;
      existing.lastUsed = new Date();
      await existing.save();
      return res.json(existing);
    }

    const newDescription = new GigDescription({
      description: description.trim(),
      station
    });
    await newDescription.save();
    res.status(201).json(newDescription);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// Buscar operador por número de empleado (para autocompletado)
router.get('/operators/search', auth, async (req, res) => {
  try {
    const { employeeNumber } = req.query;

    if (!employeeNumber) {
      return res.json({ found: false });
    }

    const operator = await Operator.findOne({ 
      employeeNumber: employeeNumber 
    });

    if (operator) {
      res.json({ 
        found: true, 
        operator: {
          employeeNumber: operator.employeeNumber,
          fullName: operator.fullName,
          station: operator.station
        }
      });
    } else {
      res.json({ found: false });
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
