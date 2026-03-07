const mongoose = require('mongoose');

const defaultTaskSchema = new mongoose.Schema({
  station: {
    type: String,
    required: true,
    trim: true
  },
  taskName: {
    type: String,
    required: true,
    trim: true
  },
  description: {
    type: String,
    required: true
  },
  order: {
    type: Number,
    default: 0
  },
  isActive: {
    type: Boolean,
    default: true
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

module.exports = mongoose.model('DefaultTask', defaultTaskSchema);
