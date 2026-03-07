const mongoose = require('mongoose');

const notificationSchema = new mongoose.Schema({
  type: {
    type: String,
    enum: ['missing-parts', 'depends-previous-station', 'task-paused', 'gig-paused'],
    required: true
  },
  title: {
    type: String,
    required: true
  },
  message: {
    type: String,
    required: true
  },
  station: {
    type: String,
    required: true
  },
  targetRole: {
    type: String,
    enum: ['lead', 'qc', 'admin'],
    default: 'lead'
  },
  relatedGigId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Gig'
  },
  relatedTaskId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Task'
  },
  truckNumber: String,
  workOrder: String,
  pausedBy: {
    workerNumber: String,
    workerName: String
  },
  isRead: {
    type: Boolean,
    default: false
  },
  readBy: [{
    userId: mongoose.Schema.Types.ObjectId,
    readAt: Date
  }],
  createdAt: {
    type: Date,
    default: Date.now
  }
});

module.exports = mongoose.model('Notification', notificationSchema);
