const mongoose = require("mongoose");

const taskSchema = new mongoose.Schema({
  station: {
    type: String,
    required: true,
    trim: true,
  },
  taskName: {
    type: String,
    required: true,
    trim: true,
  },
  description: {
    type: String,
    required: true,
  },
  truckNumber: {
    type: String,
    trim: true,
    required: true,
  },
  customerName: {
    type: String,
    trim: true,
    required: true,
  },
  salesEng: {
    type: String,
    trim: true,
    required: true,
  },
  workOrder: {
    type: String,
    trim: true,
  },
  status: {
    type: String,
    enum: ["pending", "in-progress", "completed", "paused"],
    default: "pending",
  },
  inspectionStatus: {
    type: String,
    enum: ["", "approved", "rejected"],
    default: "",
  },
  isDefaultTask: {
    type: Boolean,
    default: true,
  },
  approvedBy: {
    inspectorId: mongoose.Schema.Types.ObjectId,
    approvedAt: Date,
  },
  startedBy: {
    workerNumber: String,
    workerName: String,
    startedAt: Date,
  },
  completedBy: {
    workerNumber: String,
    workerName: String,
    completedAt: Date,
  },
  pausedInfo: {
    reason: {
      type: String,
      enum: ["missing-parts", "depends-previous-station", "other"],
    },
    note: String,
    pausedBy: {
      workerNumber: String,
      workerName: String,
    },
    pausedAt: Date,
  },

  missingParts: [
    {
      partName: {
        type: String,
        required: true,
      },
      partNumber: String,
      quantity: {
        type: Number,
        default: 1,
      },
      notes: String,
      addedAt: {
        type: Date,
        default: Date.now,
      },
      addedBy: {
        workerNumber: String,
        workerName: String,
      },
      status: {
        type: String,
        enum: ["pending", "ordered", "received"],
        default: "pending",
      },
    },
  ],

  employeeNumber: {
    type: Number,
  },
  photos: [
    {
      type: String,
    },
  ],
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
  updatedAt: {
    type: Date,
    default: Date.now,
  },
});

taskSchema.pre("save", function () {
  this.updatedAt = Date.now();
});

module.exports = mongoose.model("Task", taskSchema);
