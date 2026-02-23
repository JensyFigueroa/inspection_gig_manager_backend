const mongoose = require('mongoose');

const operatorSchema = new mongoose.Schema({
  employeeNumber: {
    type: Number,
    required: true,
    trim: true
  },
  
  fullName: {
    type: String,
    required: true,
    trim: true
  },
 
  position: {
    type: String,
    required: true,
    trim: true
  },

  station: {
    type: String,
  },

  createdAt: {
    type: Date,
    default: Date.now
  }
});

module.exports = mongoose.model('Operator', operatorSchema);