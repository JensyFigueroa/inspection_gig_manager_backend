const express = require('express');
const router = express.Router();
const Operator = require('../models/Operator');
const auth = require('../middleware/auth');

// create operator  
router.post('/', auth, async (req, res) => {
  try {
    const { employeeNumber, fullName, position, station } = req.body;
    
    // Cheack if it already exists
    const existing = await Operator.findOne({ employeeNumber });
    if (existing) {
      return res.status(400).json({ error: 'Operator with this employee number already exists' });
    }

    const operator = new Operator({ employeeNumber, fullName, position, station });
    await operator.save();
    res.status(201).json(operator);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// Get operator
router.get('/:employeeNumber', auth, async (req, res) => {
  try {
    const operator = await Operator.findOne({ employeeNumber: req.params.employeeNumber });
    res.json(operator);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get all operators
router.get('/', auth, async (req, res) => {
  try {
    const operators = await Operator.find().sort({ createdAt: -1 });
    res.json(operators);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// delete operator
router.delete('/:id', auth, async (req, res) => {
  try {
    const operator = await Operator.findByIdAndDelete(req.params.id);
    if (!operator) {
      return res.status(404).json({ error: 'Operator not found' });
    }
    res.json({ message: 'Operator  deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;