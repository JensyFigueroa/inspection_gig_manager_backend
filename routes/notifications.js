const express = require('express');
const router = express.Router();
const Notification = require('../models/Notification');
const auth = require('../middleware/auth');

// Get notifications for user (based on role and station)
router.get('/', auth, async (req, res) => {
  try {
    let query = {};

    if (req.userRole === 'lead') {
      // Lead solo ve notificaciones de su estación
      query = {
        station: req.userStation,
        targetRole: 'lead'
      };
    } else if (req.userRole === 'qc' || req.userRole === 'admin') {
      // QC y Admin ven todas
      query = {};
    } else {
      // Workers no ven notificaciones
      return res.json([]);
    }

    const notifications = await Notification.find(query)
      .sort({ createdAt: -1 })
      .limit(50);

    res.json(notifications);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get unread count
router.get('/unread-count', auth, async (req, res) => {
  try {
    let query = { isRead: false };

    if (req.userRole === 'lead') {
      query.station = req.userStation;
      query.targetRole = 'lead';
    } else if (req.userRole !== 'qc' && req.userRole !== 'admin') {
      return res.json({ count: 0 });
    }

    const count = await Notification.countDocuments(query);
    res.json({ count });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Mark notification as read
router.put('/:id/read', auth, async (req, res) => {
  try {
    const notification = await Notification.findById(req.params.id);

    if (!notification) {
      return res.status(404).json({ error: 'Notification not found' });
    }

    notification.isRead = true;
    notification.readBy.push({
      userId: req.userId,
      readAt: new Date()
    });

    await notification.save();
    res.json(notification);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// Mark all as read
router.put('/mark-all-read', auth, async (req, res) => {
  try {
    let query = {};

    if (req.userRole === 'lead') {
      query = { station: req.userStation, targetRole: 'lead', isRead: false };
    } else if (req.userRole === 'qc' || req.userRole === 'admin') {
      query = { isRead: false };
    }

    await Notification.updateMany(query, {
      $set: { isRead: true },
      $push: { readBy: { userId: req.userId, readAt: new Date() } }
    });

    res.json({ message: 'All notifications marked as read' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Delete notification
router.delete('/:id', auth, async (req, res) => {
  try {
    if (req.userRole !== 'qc' && req.userRole !== 'admin') {
      return res.status(403).json({ error: 'No permission to delete notifications' });
    }

    await Notification.findByIdAndDelete(req.params.id);
    res.json({ message: 'Notification deleted' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
