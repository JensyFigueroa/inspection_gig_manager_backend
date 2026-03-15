const mongoose = require('mongoose');

const dpuRecordSchema = new mongoose.Schema({
  weekStartDate: {
    type: Date,
    required: true
  },
  weekEndDate: {
    type: Date,
    required: true
  },
  line: {
    type: String,
    required: true,
    enum: ['RR', 'Ambulance', 'Fire', 'Other']
  },
  station: {
    type: String,
    required: true
  },
  totalUnitsInspected: {
    type: Number,
    default: 0
  },
  totalDefects: {
    type: Number,
    default: 0
  },
  dpu: {
    type: Number,
    default: 0
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }
});

dpuRecordSchema.index({ weekStartDate: 1, station: 1, line: 1 }, { unique: true });

dpuRecordSchema.pre('save', function(next) {
  if (this.totalUnitsInspected > 0) {
    this.dpu = parseFloat((this.totalDefects / this.totalUnitsInspected).toFixed(2));
  } else {
    this.dpu = 0;
  }
  next();
});

module.exports = mongoose.model('DPURecord', dpuRecordSchema);
