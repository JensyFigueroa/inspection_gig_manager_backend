const express = require('express');
const router = express.Router();
const Task = require('../models/Task');
const Notification = require('../models/Notification');
const auth = require('../middleware/auth');

// Create task (QC only)
router.post('/', auth, async (req, res) => {
  try {
    if (req.userRole !== 'qc') {
      return res.status(403).json({ error: 'Only QC can create tasks' });
    }

    const task = new Task({
      ...req.body,
      createdBy: req.userId
    });
    await task.save();
    res.status(201).json(task);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// Get tasks based on role
router.get('/', auth, async (req, res) => {
  try {
    let query = {};

    if (req.userRole === 'qc') {
      query = {};
    } else if (req.userRole === 'lead' || req.userRole === 'worker') {
      query = { station: req.userStation };
    }

    const tasks = await Task.find(query).sort({ createdAt: -1 });
    res.json({ tasks });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get a task by ID
router.get('/:id', auth, async (req, res) => {
  try {
    const task = await Task.findById(req.params.id);

    if (!task) {
      return res.status(404).json({ error: 'Task not found' });
    }

    if (
      (req.userRole === 'worker' || req.userRole === 'lead') &&
      task.station !== req.userStation
    ) {
      return res.status(403).json({ error: 'No permission to view this task' });
    }

    res.json(task);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Start task (Worker/Lead)
router.post('/:id/start', auth, async (req, res) => {
  try {
    const { workerNumber, workerName } = req.body;

    if (!workerNumber || !workerName) {
      return res.status(400).json({ error: 'Employee number and name are required.' });
    }

    const task = await Task.findById(req.params.id);

    if (!task) {
      return res.status(404).json({ error: 'Task not found' });
    }

    if (task.station !== req.userStation && req.userRole !== 'qc') {
      return res.status(403).json({ error: 'No permission to start this task' });
    }

    if (task.status !== 'pending' && task.status !== 'paused') {
      return res.status(400).json({ error: 'This task has already been started.' });
    }

    task.status = 'in-progress';
    task.startedBy = {
      workerNumber,
      workerName,
      startedAt: new Date()
    };

    if (task.status === 'paused') {
      task.pausedInfo = undefined;
    }

    await task.save();
    res.json(task);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// Complete task (Worker/Lead)
router.post('/:id/complete', auth, async (req, res) => {
  try {
    const { workerNumber, workerName } = req.body;

    if (!workerNumber || !workerName) {
      return res.status(400).json({ error: 'Employee number and name are required.' });
    }

    const task = await Task.findById(req.params.id);

    if (!task) {
      return res.status(404).json({ error: 'Task not found' });
    }

    if (task.station !== req.userStation && req.userRole !== 'qc') {
      return res.status(403).json({ error: 'No permission to complete this task' });
    }

    if (task.status !== 'in-progress') {
      return res.status(400).json({ error: 'Only tasks in progress can be completed' });
    }

    task.status = 'completed';
    task.completedBy = {
      workerNumber,
      workerName,
      completedAt: new Date()
    };

    await task.save();
    res.json(task);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// Pause task (Worker/Lead) - CON NOTIFICACIÓN
router.post('/:id/pause', auth, async (req, res) => {
  try {
    const { workerNumber, workerName, reason, note } = req.body;

    if (!workerNumber || !workerName || !reason) {
      return res.status(400).json({ error: 'Incomplete pausing information' });
    }

    const task = await Task.findById(req.params.id);

    if (!task) {
      return res.status(404).json({ error: 'Task not found' });
    }

    if (task.station !== req.userStation && req.userRole !== 'qc') {
      return res.status(403).json({ error: 'No permission to pause this task' });
    }

    task.status = 'paused';
    task.pausedInfo = {
      reason,
      note: note || '',
      pausedBy: {
        workerNumber,
        workerName
      },
      pausedAt: new Date()
    };

    await task.save();

    // Crear notificación si es missing-parts o depends-previous-station
    if (reason === 'missing-parts' || reason === 'depends-previous-station') {
      const notificationTitle = reason === 'missing-parts' 
        ? '⚠️ Missing Part Alert' 
        : '🔗 Task Dependency Alert';
      
      const notificationMessage = reason === 'missing-parts'
        ? `Task "${task.taskName}" paused due to missing parts. Truck: ${task.truckNumber}, Station: ${task.station}`
        : `Task "${task.taskName}" depends on previous station. Truck: ${task.truckNumber}, Station: ${task.station}`;

      const notification = new Notification({
        type: reason,
        title: notificationTitle,
        message: notificationMessage,
        station: task.station,
        targetRole: 'lead',
        relatedTaskId: task._id,
        truckNumber: task.truckNumber,
        workOrder: task.workOrder,
        pausedBy: {
          workerNumber,
          workerName
        }
      });

      await notification.save();
    }

    res.json(task);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// Approve task (QC)
router.post('/:id/approved', auth, async (req, res) => {
  try {
    const task = await Task.findById(req.params.id);

    if (!task) {
      return res.status(404).json({ error: 'Task not found' });
    }

    if (task.status !== 'completed') {
      return res.status(400).json({ error: 'Only completed tasks can be approved' });
    }

    task.inspectionStatus = 'approved';
    task.approvedBy = {
      approvedAt: new Date()
    };

    await task.save();
    res.json(task);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// Reject task (QC)
router.post('/:id/rejected', auth, async (req, res) => {
  try {
    const task = await Task.findById(req.params.id);

    if (!task) {
      return res.status(404).json({ error: 'Task not found' });
    }

    if (task.status !== 'completed') {
      return res.status(400).json({ error: 'Only completed tasks can be rejected' });
    }

    task.status = 'pending';
    task.inspectionStatus = 'rejected';
    task.rejectedBy = {
      rejectedAt: new Date()
    };

    await task.save();
    res.json(task);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// Update task
router.put('/:id', auth, async (req, res) => {
  try {
    const task = await Task.findById(req.params.id);

    if (!task) {
      return res.status(404).json({ error: 'Task not found' });
    }

    if (req.userRole === 'qc') {
      Object.assign(task, req.body);
    } else if (req.userRole === 'lead') {
      if (task.station !== req.userStation) {
        return res.status(403).json({ error: 'No permission to edit this task' });
      }
      if (req.body.photos) task.photos = req.body.photos;
      if (req.body.employeeNumber) task.employeeNumber = req.body.employeeNumber;
    } else if (req.userRole === 'worker') {
      if (task.station !== req.userStation) {
        return res.status(403).json({ error: 'No permission to edit this task' });
      }
      if (req.body.photos) task.photos = req.body.photos;
    }

    task.updatedAt = Date.now();
    await task.save();
    res.json(task);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// Delete task (Only QC)
router.delete('/:id', auth, async (req, res) => {
  try {
    if (req.userRole !== 'qc') {
      return res.status(403).json({ error: 'Only QC can delete tasks' });
    }

    const task = await Task.findByIdAndDelete(req.params.id);
    if (!task) {
      return res.status(404).json({ error: 'Task not found' });
    }

    res.json({ message: 'Task successfully deleted' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
