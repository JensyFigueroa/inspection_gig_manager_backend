const mongoose = require('mongoose');

const workerEfficiencySchema = new mongoose.Schema({
  employeeNumber: {
    type: String,
    required: true
  },
  employeeName: {
    type: String,
    required: true
  },
  station: {
    type: String,
    required: true
  },
  date: {
    type: Date,
    required: true
  },
  totalWorkTimeMinutes: {
    type: Number,
    default: 0
  },
  gigsCompleted: {
    type: Number,
    default: 0
  },
  tasksCompleted: {
    type: Number,
    default: 0
  },
  workSessions: [{
    gigId: mongoose.Schema.Types.ObjectId,
    taskId: mongoose.Schema.Types.ObjectId,
    type: String, // 'gig' or 'task'
    startTime: Date,
    endTime: Date,
    durationMinutes: Number
  }],
  createdAt: {
    type: Date,
    default: Date.now
  }
});

module.exports = mongoose.model('WorkerEfficiency', workerEfficiencySchema);
