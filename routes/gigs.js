const express = require('express');
const router = express.Router();
const Gig = require('../models/Gig');
const Comment = require('../models/Comment');
const auth = require('../middleware/auth');

// GET DPU Tracker data (public endpoint for the tracker table)
router.get('/dpu-tracker', async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    
    // Build query with date filters
    let query = {};
    if (startDate || endDate) {
      query.createdAt = {};
      if (startDate) {
        query.createdAt.$gte = new Date(startDate);
        console.log(query.createdAt.$gte = new Date(startDate))
      }
      if (endDate) {
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);
        query.createdAt.$lte = end;
        console.log(query.createdAt.$lte = end)
      }
    }
    
    // Get filtered gigs
    const gigs = await Gig.find(query);
    
    // Get unique trucks
    const trucksMap = new Map();
    gigs.forEach(gig => {
      if (gig.truckNumber && !trucksMap.has(gig.truckNumber)) {
        trucksMap.set(gig.truckNumber, {
          truckNumber: gig.truckNumber,
          customerName: gig.customerName || '',
          day: ''
        });
      }
    });
    
    // Convert to array and assign days
    const dayLabels = ['Mon', 'Tue', 'Wed', 'Thur'];
    const trucks = Array.from(trucksMap.values()).slice(0, 4);
    trucks.forEach((truck, idx) => {
      truck.day = dayLabels[idx] || '';
    });
    
    // Fill remaining slots if less than 4 trucks
    while (trucks.length < 4) {
      trucks.push({ truckNumber: '', customerName: '', day: dayLabels[trucks.length] || '' });
    }
    
    // Define stations
    const stations = [
      'Station 1', 'Station 2', 'Station 3', 'Station 4', 'Station 5', 'Station 6',
      'Electrico T/S', 'Harness', 'Prep', 'Cab Shop', 'Body Shop', 'Paint'
    ];
    
    // Count gigs by station and truck
    const gigsByStation = {};
    stations.forEach(station => {
      gigsByStation[station] = {};
      trucks.forEach(truck => {
        if (truck.truckNumber) {
          gigsByStation[station][truck.truckNumber] = 0;
        }
      });
    });
    
    // Count gigs
    gigs.forEach(gig => {
      const station = gig.station;
      const truckNum = gig.truckNumber;
      if (gigsByStation[station] && truckNum) {
        gigsByStation[station][truckNum] = (gigsByStation[station][truckNum] || 0) + 1;
      }
    });
    
    // Calculate week starting date
    const now = new Date();
    const dayOfWeek = now.getDay();
    const diff = now.getDate() - dayOfWeek + (dayOfWeek === 0 ? -6 : 1);
    const monday = new Date(now.setDate(diff));
    const weekStarting = `${monday.getMonth() + 1}/${monday.getDate()}/${monday.getFullYear()}`;
    
    res.json({
      weekStarting,
      trucks,
      gigsByStation
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Create gig (QC only)
router.post('/', auth, async (req, res) => {
  try {
    if (req.userRole !== 'qc') {
      return res.status(403).json({ error: 'Only QC can create gigs' });
    }

    const gig = new Gig({
      ...req.body,
      createdBy: req.userId
    });
    console.log(gig)
    await gig.save();
    res.status(201).json(gig);
  } catch (error) {
    console.log('POST')
    res.status(400).json({ error: error.message });
  }
});

// Get gigs based on role
router.get('/', auth, async (req, res) => {
  try {
    let query = {};

    // QC sees all gigs
    if (req.userRole === 'qc') {
      query = {};
    }
    // Lead y Worker only see gigs from their station
    else if (req.userRole === 'lead' || req.userRole === 'worker') {
      query = { station: req.userStation };
    }

    const gigs = await Gig.find(query).sort({ createdAt: -1 });
    res.json(gigs);

  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get a gig by ID
router.get('/:id', auth, async (req, res) => {
  try {
    const gig = await Gig.findById(req.params.id);
    
    if (!gig) {
      return res.status(404).json({ error: 'Gig not found' });
    }

    // Verify permissions
    if ((req.userRole === 'worker' || req.userRole === 'lead') && gig.station !== req.userStation) {
      return res.status(403).json({ error: 'Do not have permission to view this gig' });
    }

    res.json(gig);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Start  gig (Worker/Lead)
router.post('/:id/start', auth, async (req, res) => {
  try {
    const { workerNumber, workerName } = req.body;

    if (!workerNumber || !workerName) {
      return res.status(400).json({ error: 'Employee number and name are required.' });
    }

    const gig = await Gig.findById(req.params.id);
    
    if (!gig) {
      return res.status(404).json({ error: 'Gig not found' });
    }

    if (gig.station !== req.userStation && req.userRole !== 'qc') {
      return res.status(403).json({ error: 'Do not have permission to start this gig' });
    }

    if (gig.status !== 'pending' && gig.status !== 'blocked') {
      return res.status(400).json({ error: 'This gig has already been started.' });
    }

    gig.status = 'in-progress';
    gig.startedBy = {
      workerNumber,
      workerName,
      startedAt: new Date()
    };
    
    // Clear blocking information if it was blocked.
    if (gig.status === 'blocked') {
      gig.blockedInfo = undefined;
    }

    await gig.save();
    res.json(gig);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// Complete gig (Worker/Lead)
router.post('/:id/complete', auth, async (req, res) => {
  try {
    const { workerNumber, workerName } = req.body;

    if (!workerNumber || !workerName) {
      return res.status(400).json({ error: 'Employee number and name are required.' });
    }

    const gig = await Gig.findById(req.params.id);
    
    if (!gig) {
      return res.status(404).json({ error: 'Gig not found' });
    }

    if (gig.station !== req.userStation && req.userRole !== 'qc') {
      return res.status(403).json({ error: 'Do not have permission to complete this gig' });
    }

    if (gig.status !== 'in-progress') {
      return res.status(400).json({ error: 'Only gigs in progress can be completed' });
    }

    gig.status = 'completed';
    gig.completedBy = {
      workerNumber,
      workerName,
      completedAt: new Date()
    };

    await gig.save();
    res.json(gig);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// Block gig (Worker/Lead)
router.post('/:id/block', auth, async (req, res) => {
  try {
    const { workerNumber, workerName, reason, note } = req.body;

    if (!workerNumber || !workerName || !reason) {
      return res.status(400).json({ error: 'Incomplete blocking information' });
    }

    const gig = await Gig.findById(req.params.id);
    
    if (!gig) {
      return res.status(404).json({ error: 'Gig not found' });
    }

    if (gig.station !== req.userStation && req.userRole !== 'qc') {
      return res.status(403).json({ error: 'Do not have permission to block this gig' });
    }

    gig.status = 'blocked';
    gig.blockedInfo = {
      reason,
      note: note || '',
      blockedBy: {
        workerNumber,
        workerName
      },
      blockedAt: new Date()
    };

    await gig.save();
    res.json(gig);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// Approved gig (QC)
router.post('/:id/approved', auth, async (req, res) => {
  try {
    const { workerNumber, workerName } = req.body;


    const gig = await Gig.findById(req.params.id);
    
    if (!gig) {
      return res.status(404).json({ error: 'Gig not found' });
    }

    if (gig.status !== 'completed') {
      return res.status(400).json({ error: 'Only gigs in progress can be completed' });
    }

    gig.inspectionStatus = 'approved';
    gig.approvedBy = {
      approvedAt: new Date()
    };

    await gig.save();
    res.json(gig);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// Rejected gig (QC)
router.post('/:id/rejected', auth, async (req, res) => {
  try {

    console.log(req.body)
    const { workerNumber, workerName } = req.body;


    const gig = await Gig.findById(req.params.id);

    
    if (!gig) {
      return res.status(404).json({ error: 'Gig not found' });
    }

    if (gig.status !== 'completed') {
      return res.status(400).json({ error: 'Only gigs in progress can be completed' });
    }
    gig.status = 'pending';
    gig.inspectionStatus = 'rejected';
    gig.rejectedBy = {
      rejectedAt: new Date()
    };

    await gig.save();
    res.json(gig);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// Update gig
router.put('/:id', auth, async (req, res) => {
  try {
    const gig = await Gig.findById(req.params.id);
    console.log(req.body,'Update');
    
    if (!gig) {
      return res.status(404).json({ error: 'Gig not found' });
    }

    // Only the QC team can edit general fields
    if (req.userRole === 'lead') {
      Object.assign(gig, req.body);
    } else if (req.userRole === 'lead') {
      // Only Lead can update photos and some fields
      if (gig.station !== req.userStation) {
        return res.status(403).json({ error: 'Do not have permission to edit this gig' });
      }
      if (req.body.photos) gig.photos = req.body.photos;
      if (req.body.inspectorId) gig.inspectorId = req.body.inspectorId;
    } else if (req.userRole === 'worker') {
      // Worker solo puede actualizar fotos
      if (gig.station !== req.userStation) {
        return res.status(403).json({ error: 'Do not have permission to edit this gig' });
      }
      if (req.body.photos) gig.photos = req.body.photos;
    }

    gig.updatedAt = Date.now();
    await gig.save();
    
    res.json(gig);
  } catch (error) {
   
    res.status(400).json({ error: error.message });
  }
});

// Delete gig (Only QC)
router.delete('/:id', auth, async (req, res) => {
  try {
    if (req.userRole !== 'qc') {
      return res.status(403).json({ error: 'Only QC can delete gigs' });
    }

    const gig = await Gig.findByIdAndDelete(req.params.id);
    if (!gig) {
      return res.status(404).json({ error: 'Gig not found' });
    }
    
    await Comment.deleteMany({ gigId: req.params.id });
    
    res.json({ message: 'Gig successfully deleted' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Add comment
router.post('/:id/comments', auth, async (req, res) => {
  try {
    const gig = await Gig.findById(req.params.id);
    if (!gig) {
      return res.status(404).json({ error: 'Gig not found' });
    }

    const comment = new Comment({
      gigId: req.params.id,
      text: req.body.text,
      authorId: req.userId,
      authorName: req.userName
    });

    await comment.save();
    res.status(201).json(comment);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// Get comments
router.get('/:id/comments', auth, async (req, res) => {
  try {
    const comments = await Comment.find({ gigId: req.params.id }).sort({ createdAt: -1 });
    res.json(comments);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});



module.exports = router;