const express = require("express");
const router = express.Router();
const Gig = require("../models/Gig");
const Comment = require("../models/Comment");
const auth = require("../middleware/auth");
const Notification = require('../models/Notification');

// GET DPU Tracker data (public endpoint for the tracker table)
router.get("/dpu-tracker", async (req, res) => {
  try {
    const { startDate } = req.query;

    if (!startDate)
      return res.status(400).json({ message: "startDate is required" });

    // Parseamos YYYY-MM-DD
    const parts = startDate.split("-");
    if (parts.length !== 3)
      return res.status(400).json({ message: "Invalid startDate" });

    const selectedDate = new Date(
      parseInt(parts[0]),
      parseInt(parts[1]) - 1,
      parseInt(parts[2]),
    );
    selectedDate.setHours(0, 0, 0, 0);

    // Ajustar al lunes de esa semana
    const dayOfWeek = selectedDate.getDay(); // 0=domingo, 1=lunes...
    const diff = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
    const monday = new Date(selectedDate);
    monday.setDate(selectedDate.getDate() + diff);
    monday.setHours(0, 0, 0, 0);

    // Calcular jueves
    const thursday = new Date(monday);
    thursday.setDate(monday.getDate() + 3);
    thursday.setHours(23, 59, 59, 999);

    // Traer gigs de lunes a jueves
    const gigs = await Gig.find({
      createdAt: { $gte: monday, $lte: thursday },
    });

    // Si no hay gigs, devolvemos un array vacío
    if (gigs.length === 0) {
      return res.json({
        weekStarting: `${monday.getMonth() + 1}/${monday.getDate()}/${monday.getFullYear()}`,
        trucks: [],
        gigsByStation: {},
        message: "No gigs found for this week",
      });
    }

    // Trucks únicos
    const trucksMap = new Map();
    gigs.forEach((gig) => {
      if (gig.truckNumber && !trucksMap.has(gig.truckNumber)) {
        trucksMap.set(gig.truckNumber, {
          truckNumber: gig.truckNumber,
          customerName: gig.customerName || "",
          day: "",
        });
      }
    });

    const dayLabels = ["Mon", "Tue", "Wed", "Thu"];
    const trucks = Array.from(trucksMap.values());
    trucks.forEach((truck, idx) => {
      truck.day = dayLabels[idx % 4] || "";
    });

    // Definir estaciones
    const stations = [
      "Station 1",
      "Station 2",
      "Station 3",
      "Station 4",
      "Station 5",
      "Station 6",
      "Electrico T/S",
      "Harness",
      "Prep",
      "Cab Shop",
      "Body Shop",
      "Paint",
    ];

    // Inicializar conteo de gigs
    const gigsByStation = {};
    stations.forEach((station) => {
      gigsByStation[station] = {};
      trucks.forEach((truck) => {
        gigsByStation[station][truck.truckNumber] = 0;
      });
    });

    // Contar gigs por estación y truck
    gigs.forEach((gig) => {
      const station = gig.station;
      const truckNum = gig.truckNumber;
      if (gigsByStation[station] && truckNum) {
        gigsByStation[station][truckNum] =
          (gigsByStation[station][truckNum] || 0) + 1;
      }
    });

    const formatDate = (date) =>
      `${date.getMonth() + 1}/${date.getDate()}/${date.getFullYear()}`;

    res.json({
      weekStarting: formatDate(monday),
      trucks,
      gigsByStation,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: error.message });
  }
});

// GET DPU History - Promedio por semana
router.get('/dpu-history', async (req, res) => {
  try {
    const { year } = req.query;
    const selectedYear = year ? parseInt(year) : new Date().getFullYear();
    
    // Obtener todos los gigs del año
    const startOfYear = new Date(selectedYear, 0, 1);
    const endOfYear = new Date(selectedYear, 11, 31, 23, 59, 59);
    
    const gigs = await Gig.find({
      createdAt: { $gte: startOfYear, $lte: endOfYear }
    });
    
    // Agrupar por semana del año (lunes a jueves como en dpu-tracker)
    const weeklyData = {};
    
    gigs.forEach(gig => {
      const date = new Date(gig.createdAt);
      
      // Calcular el lunes de esa semana
      const dayOfWeek = date.getDay();
      const diff = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
      const monday = new Date(date);
      monday.setDate(date.getDate() + diff);
      
      // Crear clave única para la semana (formato: "1-Jan", "2-Jan", etc.)
      const weekOfMonth = Math.ceil(monday.getDate() / 7);
      const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
      const month = monthNames[monday.getMonth()];
      const weekKey = `${weekOfMonth}-${month}`;
      
      if (!weeklyData[weekKey]) {
        weeklyData[weekKey] = {
          week: weekKey,
          month: monday.getMonth(),
          weekOfMonth: weekOfMonth,
          totalGigs: 0,
          trucks: new Set()
        };
      }
      
      weeklyData[weekKey].totalGigs++;
      if (gig.truckNumber) {
        weeklyData[weekKey].trucks.add(gig.truckNumber);
      }
    });
    
    // Convertir a array y calcular promedios
    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    
    // Generar todas las semanas del año
    const allWeeks = [];
    monthNames.forEach((month, monthIndex) => {
      for (let week = 1; week <= 4; week++) {
        const weekKey = `${week}-${month}`;
        const existingData = weeklyData[weekKey];
        
        if (existingData && existingData.trucks.size > 0) {
          allWeeks.push({
            week: weekKey,
            monthIndex: monthIndex,
            weekOfMonth: week,
            avgDPU: Math.round((existingData.totalGigs / existingData.trucks.size) * 100) / 100,
            totalGigs: existingData.totalGigs,
            trucksCount: existingData.trucks.size
          });
        } else {
          allWeeks.push({
            week: weekKey,
            monthIndex: monthIndex,
            weekOfMonth: week,
            avgDPU: null,
            totalGigs: 0,
            trucksCount: 0
          });
        }
      }
    });
    
    res.json({
      year: selectedYear,
      data: allWeeks
    });
  } catch (error) {
    console.error('Error in dpu-history:', error);
    res.status(500).json({ error: error.message });
  }
});






// Create gig (QC only)
router.post("/", auth, async (req, res) => {
  try {
    if (req.userRole !== "qc") {
      return res.status(403).json({ error: "Only QC can create gigs" });
    }

    const gig = new Gig({
      ...req.body,
      createdBy: req.userId,
    });
    console.log(gig);
    await gig.save();
    res.status(201).json(gig);
  } catch (error) {
    console.log("POST");
    res.status(400).json({ error: error.message });
  }
});

// Get gigs based on role
router.get("/", auth, async (req, res) => {
  try {
    let query = {};

    // QC sees all gigs
    if (req.userRole === "qc") {
      query = {};
    }
    // Lead y Worker only see gigs from their station
    else if (req.userRole === "lead" || req.userRole === "worker") {
      query = { station: req.userStation };
    }

    const gigs = await Gig.find(query).sort({ createdAt: -1 });

    const [comments] = await Promise.all([
      Comment.find({ gigId: { $in: gigs.map((g) => g._id) } }),
    ]);

    res.json({ gigs, comments });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get a gig by ID
router.get("/:id", auth, async (req, res) => {
  try {
    const gig = await Gig.findById(req.params.id);

    if (!gig) {
      return res.status(404).json({ error: "Gig not found" });
    }

    // Verify permissions
    if (
      (req.userRole === "worker" || req.userRole === "lead") &&
      gig.station !== req.userStation
    ) {
      return res
        .status(403)
        .json({ error: "Do not have permission to view this gig" });
    }

    res.json(gig);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Start  gig (Worker/Lead)
router.post("/:id/start", auth, async (req, res) => {
  try {
    const { workerNumber, workerName } = req.body;

    if (!workerNumber || !workerName) {
      return res
        .status(400)
        .json({ error: "Employee number and name are required." });
    }

    const gig = await Gig.findById(req.params.id);

    if (!gig) {
      return res.status(404).json({ error: "Gig not found" });
    }

    if (gig.station !== req.userStation && req.userRole !== "qc") {
      return res
        .status(403)
        .json({ error: "Do not have permission to start this gig" });
    }

    if (gig.status !== "pending" && gig.status !== "paused") {
      return res
        .status(400)
        .json({ error: "This gig has already been started." });
    }

    gig.status = "in-progress";
    gig.startedBy = {
      workerNumber,
      workerName,
      startedAt: new Date(),
    };

    // Clear paused information if it was paused.
    if (gig.status === "paused") {
      gig.pausedInfo = undefined;
    }

    await gig.save();
    res.json(gig);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// Complete gig (Worker/Lead)
router.post("/:id/complete", auth, async (req, res) => {
  try {
    const { workerNumber, workerName } = req.body;

    if (!workerNumber || !workerName) {
      return res
        .status(400)
        .json({ error: "Employee number and name are required." });
    }

    const gig = await Gig.findById(req.params.id);

    if (!gig) {
      return res.status(404).json({ error: "Gig not found" });
    }

    if (gig.station !== req.userStation && req.userRole !== "qc") {
      return res
        .status(403)
        .json({ error: "Do not have permission to complete this gig" });
    }

    if (gig.status !== "in-progress") {
      return res
        .status(400)
        .json({ error: "Only gigs in progress can be completed" });
    }

    gig.status = "completed";
    gig.completedBy = {
      workerNumber,
      workerName,
      completedAt: new Date(),
    };

    await gig.save();
    res.json(gig);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// Pause gig (Worker/Lead)
router.post("/:id/pause", auth, async (req, res) => {
  try {
    const { workerNumber, workerName, reason, note } = req.body;

    if (!workerNumber || !workerName || !reason) {
      return res.status(400).json({ error: "Incomplete pausing information" });
    }

    const gig = await Gig.findById(req.params.id);

    if (!gig) {
      return res.status(404).json({ error: "Gig not found" });
    }

    if (gig.station !== req.userStation && req.userRole !== "qc") {
      return res
        .status(403)
        .json({ error: "Do not have permission to pause this gig" });
    }

    gig.status = "paused";
    gig.pausedInfo = {
      reason,
      note: note || "",
      pausedBy: {
        workerNumber,
        workerName,
      },
      pausedAt: new Date(),
    };

    await gig.save();
    // Crear notificación si es missing-parts o depends-previous-station
    if (reason === 'missing-parts' || reason === 'depends-previous-station') {
      const notificationTitle = reason === 'missing-parts' 
        ? '⚠️ Missing Part Alert' 
        : '🔗 Gig Dependency Alert';
      
      const notificationMessage = reason === 'missing-parts'
        ? `Gig paused due to missing parts. Truck: ${gig.truckNumber}, Station: ${gig.station}. Note: ${note || 'N/A'}`
        : `Gig depends on previous station. Truck: ${gig.truckNumber}, Station: ${gig.station}. Note: ${note || 'N/A'}`;

      const notification = new Notification({
        type: reason,
        title: notificationTitle,
        message: notificationMessage,
        station: gig.station,
        targetRole: 'lead',
        relatedGigId: gig._id,
        truckNumber: gig.truckNumber,
        workOrder: gig.workOrder,
        pausedBy: {
          workerNumber,
          workerName
        }
      });

      await notification.save();
    }

    res.json(gig);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// Approved gig (QC)
router.post("/:id/approved", auth, async (req, res) => {
  try {
    const { workerNumber, workerName } = req.body;

    const gig = await Gig.findById(req.params.id);

    if (!gig) {
      return res.status(404).json({ error: "Gig not found" });
    }

    if (gig.status !== "completed") {
      return res
        .status(400)
        .json({ error: "Only gigs in progress can be completed" });
    }

    gig.inspectionStatus = "approved";
    gig.approvedBy = {
      approvedAt: new Date(),
    };

    await gig.save();
    res.json(gig);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// Rejected gig (QC)
router.post("/:id/rejected", auth, async (req, res) => {
  try {
    const { workerNumber, workerName } = req.body;

    const gig = await Gig.findById(req.params.id);

    if (!gig) {
      return res.status(404).json({ error: "Gig not found" });
    }

    if (gig.status !== "completed") {
      return res
        .status(400)
        .json({ error: "Only gigs in progress can be completed" });
    }
    gig.status = "pending";
    gig.inspectionStatus = "rejected";
    gig.rejectedBy = {
      rejectedAt: new Date(),
    };

    await gig.save();
    res.json(gig);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// Update gig
router.put("/:id", auth, async (req, res) => {
  try {
    const gig = await Gig.findById(req.params.id);

    if (!gig) {
      return res.status(404).json({ error: "Gig not found" });
    }

    // Only the QC team can edit general fields
    if (req.userRole === "lead") {
      Object.assign(gig, req.body);
    } else if (req.userRole === "lead") {
      // Only Lead can update photos and some fields
      if (gig.station !== req.userStation) {
        return res
          .status(403)
          .json({ error: "Do not have permission to edit this gig" });
      }
      if (req.body.photos) gig.photos = req.body.photos;
      if (req.body.inspectorId) gig.inspectorId = req.body.inspectorId;
    } else if (req.userRole === "worker") {
      // Worker solo puede actualizar fotos
      if (gig.station !== req.userStation) {
        return res
          .status(403)
          .json({ error: "Do not have permission to edit this gig" });
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
router.delete("/:id", auth, async (req, res) => {
  try {
    if (req.userRole !== "qc") {
      return res.status(403).json({ error: "Only QC can delete gigs" });
    }

    const gig = await Gig.findByIdAndDelete(req.params.id);
    if (!gig) {
      return res.status(404).json({ error: "Gig not found" });
    }

    await Comment.deleteMany({ gigId: req.params.id });

    res.json({ message: "Gig successfully deleted" });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Add comment
router.post("/:id/comments", auth, async (req, res) => {
  try {
    const gig = await Gig.findById(req.params.id);
    if (!gig) {
      return res.status(404).json({ error: "Gig not found" });
    }

    const comment = new Comment({
      gigId: req.params.id,
      text: req.body.text,
      authorId: req.userId,
      authorName: req.userName,
    });

    await comment.save();
    res.status(201).json(comment);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// Get comments
router.get("/:id/comments", auth, async (req, res) => {
  try {
    const comments = await Comment.find({ gigId: req.params.id }).sort({
      createdAt: -1,
    });
    res.json(comments);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
