const express = require('express');
const router = express.Router();
const Notification = require('../models/Notification');
const auth = require('../middleware/auth');

// ============================================
// GET notifications for user (based on role and station)
// ============================================
router.get('/', auth, async (req, res) => {
  try {
    let query = {};

    if (req.userRole === 'lead') {
      query = {
        station: req.userStation,
        targetRole: 'lead'
      };
    } else if (req.userRole === 'admin') {
      query = { targetRole: 'admin' };
    } else if (req.userRole === 'qc') {
      query = {};
    } else {
      return res.json([]);
    }

    // OPTIMIZADO: usar lean() y limitar campos
    const notifications = await Notification.find(query)
      .select('type title message station isRead createdAt truckNumber workOrder')
      .sort({ createdAt: -1 })
      .limit(50)
      .lean();

    res.json(notifications);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// GET unread count - OPTIMIZADO (SOLO UNA VEZ, NO DUPLICADO)
// ============================================
router.get('/unread-count', auth, async (req, res) => {
  try {
    let query = { isRead: false };

    if (req.userRole === 'lead') {
      query.station = req.userStation;
      query.targetRole = 'lead';
    } else if (req.userRole === 'admin') {
      query.targetRole = 'admin';
    } else if (req.userRole !== 'qc') {
      return res.json({ count: 0 });
    }

    // OPTIMIZADO: countDocuments es más eficiente
    const count = await Notification.countDocuments(query);
    
    // Cache header para reducir llamadas
    res.set('Cache-Control', 'private, max-age=30');
    res.json({ count });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// Mark notification as read
// ============================================
router.put('/:id/read', auth, async (req, res) => {
  try {
    const notification = await Notification.findByIdAndUpdate(
      req.params.id,
      {
        $set: { isRead: true },
        $push: { readBy: { userId: req.userId, readAt: new Date() } }
      },
      { new: true }
    );

    if (!notification) {
      return res.status(404).json({ error: 'Notification not found' });
    }

    res.json(notification);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// ============================================
// Mark all as read
// ============================================
router.put('/mark-all-read', auth, async (req, res) => {
  try {
    let query = { isRead: false };

    if (req.userRole === 'lead') {
      query.station = req.userStation;
      query.targetRole = 'lead';
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

// ============================================
// Delete notification
// ============================================
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
