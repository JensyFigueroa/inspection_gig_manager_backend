const mongoose = require('mongoose');

const gigSchema = new mongoose.Schema({
  station: {
    type: String,
    required: true,
    trim: true
  },
  description: {
    type: String,
    required: true
  },
  truckNumber: {
    type: String,
    trim: true,
    required: true
  },
  customerName: {
    type: String,
    trim: true,
    required: true
  },
  salesEng: {
    type: String,
    trim: true,
    required: true
  },
  workOrder: {
    type: String,
    trim: true
  },
  status: {
    type: String,
    enum: ['pending', 'in-progress', 'completed', 'paused'],
    default: 'pending'
  },
  inspectorId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Inspector'
  },

  inspectionStatus:{
    type: String,
    enum: ['','approved', 'rejected'],
    default: ''
  },
  // Information about who started the gig
  approvedBy: {
    inspectorId:  mongoose.Schema.Types.ObjectId,
    approvedAt: Date
  },
  // Information about who started the gig
  startedBy: {
    workerNumber: String,
    workerName: String,
    startedAt: Date
  },
  // Information about who completed the gig
  completedBy: {
    workerNumber: String,
    workerName: String,
    completedAt: Date
  },
  // Information about pausing the gig
  pausedInfo: {
    reason: {
      type: String,
      enum: ['missing-parts', 'depends-previous-station', 'other']
    },
    note: String,
    pausedBy: {
      workerNumber: String,
      workerName: String
    },
    pausedAt: Date
  },
  employeeNumber: {
    type: Number,
  },
  photos: [{
    type: String
  }],
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
});

gigSchema.pre('save', function() {
  this.updatedAt = Date.now();
  
});

module.exports = mongoose.model('Gig', gigSchema);