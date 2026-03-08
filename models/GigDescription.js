const mongoose = require('mongoose');

const gigDescriptionSchema = new mongoose.Schema({
  description: {
    type: String,
    required: true,
    unique: true,
    trim: true
  },
  station: {
    type: String,
    trim: true
  },
  usageCount: {
    type: Number,
    default: 1
  },
  lastUsed: {
    type: Date,
    default: Date.now
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

// Index para búsqueda rápida
gigDescriptionSchema.index({ description: 'text' });

module.exports = mongoose.model('GigDescription', gigDescriptionSchema);
