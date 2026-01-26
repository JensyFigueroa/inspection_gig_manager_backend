const express = require('express');
const router = express.Router();
const User = require('../models/User');
const auth = require('../middleware/auth');

// Get user by ID
router.get('/:_id', auth, async (req, res) => {
  try {
    const user = await User.findOne({ _id: req.params._id });
    res.json(user);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});
// Get all users
router.get('/', auth, async (req, res) => {
  try {
    const users = await User.find().sort({ createdAt: -1 });
    res.json(users);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;