const express = require("express");
const router = express.Router();
const Gig = require("../models/Gig");
const Comment = require("../models/Comment");
const auth = require("../middleware/auth");
const Notification = require('../models/Notification');
const GigDescription = require('../models/GigDescription');


// =====================================================
// RUTAS PÚBLICAS (SIN AUTH) - DEBEN IR PRIMERO
// =====================================================

// GET DPU Tracker data (public endpoint for the tracker table)
router.get("/dpu-tracker", async (req, res) => {
  try {
    const { startDate } = req.query;

    if (!startDate)
      return res.status(400).json({ message: "startDate is required" });

    const parts = startDate.split("-");
    if (parts.length !== 3)
      return res.status(400).json({ message: "Invalid startDate format" });

    const year = parseInt(parts[0]);
    const month = parseInt(parts[1]) - 1;
    const day = parseInt(parts[2]);
    
    const monday = new Date(Date.UTC(year, month, day, 0, 0, 0, 0));
    const thursday = new Date(Date.UTC(year, month, day + 3, 23, 59, 59, 999));

    console.log("Buscando gigs desde:", monday.toISOString(), "hasta:", thursday.toISOString());

    const gigs = await Gig.find({
      createdAt: { $gte: monday, $lte: thursday },
    });

    console.log("Gigs encontrados:", gigs.length);

    const formatDate = (date) =>
      `${date.getUTCMonth() + 1}/${date.getUTCDate()}/${date.getUTCFullYear()}`;

    if (gigs.length === 0) {
      return res.json({
        weekStarting: formatDate(monday),
        trucks: [
          { truckNumber: "", customerName: "", day: "Mon" },
          { truckNumber: "", customerName: "", day: "Tue" },
          { truckNumber: "", customerName: "", day: "Wed" },
          { truckNumber: "", customerName: "", day: "Thu" },
        ],
        gigsByStation: {},
        message: "No gigs found for this week",
      });
    }

    const gigsByDay = {
      Mon: [],
      Tue: [],
      Wed: [],
      Thu: [],
    };

    const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

    gigs.forEach((gig) => {
      const gigDate = new Date(gig.createdAt);
      const dayName = dayNames[gigDate.getUTCDay()];
      if (gigsByDay[dayName]) {
        gigsByDay[dayName].push(gig);
      }
    });

    const trucks = [];
    const dayOrder = ["Mon", "Tue", "Wed", "Thu"];

    dayOrder.forEach((day) => {
      const dayGigs = gigsByDay[day];
      if (dayGigs.length > 0) {
        const uniqueTrucks = new Map();
        dayGigs.forEach((gig) => {
          if (gig.truckNumber && !uniqueTrucks.has(gig.truckNumber)) {
            uniqueTrucks.set(gig.truckNumber, {
              truckNumber: gig.truckNumber,
              customerName: gig.customerName || "",
              day: day,
            });
          }
        });
        trucks.push(...uniqueTrucks.values());
      } else {
        trucks.push({
          truckNumber: "",
          customerName: "",
          day: day,
        });
      }
    });

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

    const gigsByStation = {};
    stations.forEach((station) => {
      gigsByStation[station] = {};
      trucks.forEach((truck) => {
        if (truck.truckNumber) {
          gigsByStation[station][truck.truckNumber] = 0;
        }
      });
    });

    gigs.forEach((gig) => {
      const station = gig.station;
      const truckNum = gig.truckNumber;
      if (gigsByStation[station] && truckNum) {
        gigsByStation[station][truckNum] =
          (gigsByStation[station][truckNum] || 0) + 1;
      }
    });

    res.json({
      weekStarting: formatDate(monday),
      trucks,
      gigsByStation,
    });
  } catch (error) {
    console.error("Error en dpu-tracker:", error);
    res.status(500).json({ error: error.message });
  }
});


// GET DPU History - Promedio por semana
router.get('/dpu-history', async (req, res) => {
  try {
    const { year } = req.query;
    const selectedYear = year ? parseInt(year) : new Date().getFullYear();
    
    const startOfYear = new Date(selectedYear, 0, 1);
    const endOfYear = new Date(selectedYear, 11, 31, 23, 59, 59);
    
    const gigs = await Gig.find({
      createdAt: { $gte: startOfYear, $lte: endOfYear }
    });
    
    const weeklyData = {};
    
    gigs.forEach(gig => {
      const date = new Date(gig.createdAt);
      
      const dayOfWeek = date.getDay();
      const diff = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
      const monday = new Date(date);
      monday.setDate(date.getDate() + diff);
      
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
    
    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    
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


// GET Weekly Comparison Data - Comparación entre semanas (DEBE IR ANTES DE /:id)
router.get("/weekly-comparison", async (req, res) => {
  try {
    const { currentWeekStart } = req.query;

    if (!currentWeekStart) {
      return res.status(400).json({ message: "currentWeekStart is required" });
    }

    const parts = currentWeekStart.split("-");
    if (parts.length !== 3) {
      return res.status(400).json({ message: "Invalid date format" });
    }

    const year = parseInt(parts[0]);
    const month = parseInt(parts[1]) - 1;
    const day = parseInt(parts[2]);

    // Semana actual (Current Week)
    const currentMonday = new Date(Date.UTC(year, month, day, 0, 0, 0, 0));
    const currentThursday = new Date(Date.UTC(year, month, day + 3, 23, 59, 59, 999));

    // Semana anterior (Last Week) - 7 días antes
    const lastMondayDate = new Date(currentMonday);
    lastMondayDate.setUTCDate(lastMondayDate.getUTCDate() - 7);
    const lastThursdayDate = new Date(lastMondayDate);
    lastThursdayDate.setUTCDate(lastThursdayDate.getUTCDate() + 3);
    lastThursdayDate.setUTCHours(23, 59, 59, 999);

    // Primera semana del año (Start Week)
    const janFirst = new Date(Date.UTC(year, 0, 1, 0, 0, 0, 0));
    const dayOfWeek = janFirst.getUTCDay();
    let daysToMonday = 0;
    if (dayOfWeek === 0) {
      daysToMonday = 1;
    } else if (dayOfWeek === 1) {
      daysToMonday = 0;
    } else {
      daysToMonday = 8 - dayOfWeek;
    }
    const firstMonday = new Date(Date.UTC(year, 0, 1 + daysToMonday, 0, 0, 0, 0));
    const firstThursday = new Date(Date.UTC(year, 0, 1 + daysToMonday + 3, 23, 59, 59, 999));

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

    const getGigsByStation = async (startDate, endDate) => {
      const gigs = await Gig.find({
        createdAt: { $gte: startDate, $lte: endDate },
      });

      const stationCounts = {};
      stations.forEach((station) => {
        stationCounts[station] = 0;
      });

      gigs.forEach((gig) => {
        if (stationCounts.hasOwnProperty(gig.station)) {
          stationCounts[gig.station]++;
        }
      });

      return stationCounts;
    };

    const startWeekData = await getGigsByStation(firstMonday, firstThursday);
    const lastWeekData = await getGigsByStation(lastMondayDate, lastThursdayDate);
    const currentWeekData = await getGigsByStation(currentMonday, currentThursday);

    const calculateTotal = (data) => {
      let total = 0;
      for (const key in data) {
        total += data[key];
      }
      return total;
    };

    const formatDate = (date) => {
      return (date.getUTCMonth() + 1) + "/" + date.getUTCDate() + "/" + date.getUTCFullYear();
    };

    res.json({
      startWeek: {
        date: formatDate(firstMonday),
        data: startWeekData,
        total: calculateTotal(startWeekData),
      },
      lastWeek: {
        date: formatDate(lastMondayDate),
        data: lastWeekData,
        total: calculateTotal(lastWeekData),
      },
      currentWeek: {
        date: formatDate(currentMonday),
        data: currentWeekData,
        total: calculateTotal(currentWeekData),
      },
      stations: stations,
    });
  } catch (error) {
    console.error("Error en weekly-comparison:", error);
    res.status(500).json({ error: error.message });
  }
});


// =====================================================
// RUTAS CON AUTH
// =====================================================

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
    await gig.save();

    try {
      const existingDesc = await GigDescription.findOne({
        description: { $regex: `^${gig.description.trim()}$`, $options: 'i' }
      });

      if (existingDesc) {
        existingDesc.usageCount += 1;
        existingDesc.lastUsed = new Date();
        await existingDesc.save();
      } else {
        await GigDescription.create({
          description: gig.description.trim(),
          station: gig.station
        });
      }
    } catch (descError) {
      console.log('Error saving description:', descError);
    }

    res.status(201).json(gig);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});


// Get gigs based on role - OPTIMIZADO
router.get("/", auth, async (req, res) => {
  try {
    let query = {};

    if (req.userRole === "qc") {
      query = {};
    } else if (req.userRole === "lead" || req.userRole === "worker") {
      query = { station: req.userStation };
    }

    // OPTIMIZADO: 
    // 1. Excluir fotos (son pesadas) en listado
    // 2. Usar lean() para mejor rendimiento
    // 3. Limitar resultados
    const gigs = await Gig.find(query)
      .select('-photos -missingParts')
      .sort({ createdAt: -1 })
      .limit(200)
      .lean();

    // Obtener comentarios solo para los gigs encontrados
    const gigIds = gigs.map(g => g._id);
    
    const comments = await Comment.find({ gigId: { $in: gigIds } })
      .select('gigId text authorName createdAt')
      .sort({ createdAt: -1 })
      .lean();

    res.json({ gigs, comments });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});


// Get all missing parts for a truck
router.get('/missing-parts/:truckNumber', auth, async (req, res) => {
  try {
    const { truckNumber } = req.params;

    if (req.userRole !== 'admin' && req.userRole !== 'qc') {
      return res.status(403).json({ error: 'No permission to view missing parts' });
    }

    const gigs = await Gig.find({
      truckNumber,
      'missingParts.0': { $exists: true }
    });

    const allMissingParts = [];

    gigs.forEach(gig => {
      gig.missingParts.forEach(part => {
        allMissingParts.push({
          ...part.toObject(),
          sourceType: 'gig',
          sourceId: gig._id,
          station: gig.station,
          gigDescription: gig.description
        });
      });
    });

    res.json({
      truckNumber,
      totalParts: allMissingParts.length,
      parts: allMissingParts.sort((a, b) => new Date(b.addedAt) - new Date(a.addedAt))
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});


// Update missing part status
router.put('/missing-parts/:gigId/:partId', auth, async (req, res) => {
  try {
    if (req.userRole !== 'admin' && req.userRole !== 'qc') {
      return res.status(403).json({ error: 'No permission to update missing parts' });
    }

    const { gigId, partId } = req.params;
    const { status } = req.body;

    const gig = await Gig.findById(gigId);
    if (!gig) {
      return res.status(404).json({ error: 'Gig not found' });
    }

    const partIndex = gig.missingParts.findIndex(p => p._id.toString() === partId);
    if (partIndex === -1) {
      return res.status(404).json({ error: 'Part not found' });
    }

    gig.missingParts[partIndex].status = status;
    await gig.save();

    res.json(gig);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});


// GET all missing parts for a truck
router.get('/missing-parts/:truckNumber', auth, async (req, res) => {
  try {
    const { truckNumber } = req.params;

    // Solo admin y QC pueden ver missing parts
    if (req.userRole !== 'admin' && req.userRole !== 'qc') {
      return res.status(403).json({ error: 'No permission to view missing parts' });
    }

    // Buscar gigs con missing parts para este truck
    const gigs = await Gig.find({
      truckNumber: truckNumber,
      'missingParts.0': { $exists: true }
    });

    const allMissingParts = [];

    gigs.forEach(gig => {
      if (gig.missingParts && gig.missingParts.length > 0) {
        gig.missingParts.forEach(part => {
          allMissingParts.push({
            _id: part._id,
            partNumber: part.partNumber || '',
            partName: part.partName || '',
            description: part.partName || '',
            status: part.status || 'pending',
            quantity: part.quantity || 1,
            notes: part.notes || '',
            addedAt: part.addedAt,
            addedBy: part.addedBy,
            sourceType: 'gig',
            sourceId: gig._id,
            station: gig.station,
            gigDescription: gig.description
          });
        });
      }
    });

    res.json({
      truckNumber,
      totalParts: allMissingParts.length,
      parts: allMissingParts.sort((a, b) => new Date(b.addedAt) - new Date(a.addedAt))
    });
  } catch (error) {
    console.error('Error getting missing parts:', error);
    res.status(500).json({ error: error.message });
  }
});

// UPDATE missing part (status and partNumber)
router.put('/missing-parts/:gigId/:partId', auth, async (req, res) => {
  try {
    // Solo admin y QC pueden actualizar missing parts
    if (req.userRole !== 'admin' && req.userRole !== 'qc') {
      return res.status(403).json({ error: 'No permission to update missing parts' });
    }

    const { gigId, partId } = req.params;
    const { status, partNumber } = req.body;

    const gig = await Gig.findById(gigId);
    if (!gig) {
      return res.status(404).json({ error: 'Gig not found' });
    }

    const partIndex = gig.missingParts.findIndex(p => p._id.toString() === partId);
    if (partIndex === -1) {
      return res.status(404).json({ error: 'Part not found' });
    }

    // Actualizar campos
    if (status) {
      gig.missingParts[partIndex].status = status;
    }
    if (partNumber !== undefined) {
      gig.missingParts[partIndex].partNumber = partNumber;
    }

    await gig.save();

    res.json({
      message: 'Part updated successfully',
      part: gig.missingParts[partIndex]
    });
  } catch (error) {
    console.error('Error updating missing part:', error);
    res.status(400).json({ error: error.message });
  }
});

// GET all missing parts for a truck
router.get('/missing-parts/:truckNumber', auth, async (req, res) => {
  try {
    const { truckNumber } = req.params;

    console.log('Buscando missing parts para truck:', truckNumber);

    // Solo admin y QC pueden ver missing parts
    if (req.userRole !== 'admin' && req.userRole !== 'qc') {
      return res.status(403).json({ error: 'No permission to view missing parts' });
    }

    // Buscar TODOS los gigs de este truck que tengan missingParts
    const gigs = await Gig.find({
      truckNumber: truckNumber
    });

    console.log('Gigs encontrados para truck:', gigs.length);

    const allMissingParts = [];

    gigs.forEach(gig => {
      // Verificar si el gig tiene missingParts array
      if (gig.missingParts && gig.missingParts.length > 0) {
        gig.missingParts.forEach(part => {
          allMissingParts.push({
            _id: part._id,
            partNumber: part.partNumber || '',
            partName: part.partName || '',
            quantity: part.quantity || 1,
            notes: part.notes || '',
            status: part.status || 'pending',
            addedAt: part.addedAt,
            addedBy: part.addedBy,
            sourceId: gig._id,
            station: gig.station,
            gigDescription: gig.description
          });
        });
      }

      // También verificar si hay missing part en pausedInfo
      if (gig.pausedInfo && gig.pausedInfo.reason === 'missing-parts' && gig.pausedInfo.note) {
        // Verificar si ya existe este missing part en el array
        const existsInMissingParts = gig.missingParts && gig.missingParts.some(
          mp => mp.partName === gig.pausedInfo.note
        );
        
        if (!existsInMissingParts) {
          allMissingParts.push({
            _id: gig._id + '_paused',
            partNumber: '',
            partName: gig.pausedInfo.note,
            quantity: 1,
            notes: '',
            status: 'pending',
            addedAt: gig.pausedInfo.pausedAt,
            addedBy: gig.pausedInfo.pausedBy,
            sourceId: gig._id,
            station: gig.station,
            gigDescription: gig.description,
            fromPausedInfo: true
          });
        }
      }
    });

    console.log('Missing parts encontrados:', allMissingParts.length);

    res.json({
      truckNumber,
      totalParts: allMissingParts.length,
      parts: allMissingParts.sort((a, b) => new Date(b.addedAt) - new Date(a.addedAt))
    });
  } catch (error) {
    console.error('Error getting missing parts:', error);
    res.status(500).json({ error: error.message });
  }
});

// UPDATE missing part (status and partNumber)
router.put('/missing-parts/:gigId/:partId', auth, async (req, res) => {
  try {
    // Solo admin y QC pueden actualizar missing parts
    if (req.userRole !== 'admin' && req.userRole !== 'qc') {
      return res.status(403).json({ error: 'No permission to update missing parts' });
    }

    const { gigId, partId } = req.params;
    const { status, partNumber } = req.body;

    console.log('Actualizando missing part:', { gigId, partId, status, partNumber });

    const gig = await Gig.findById(gigId);
    if (!gig) {
      return res.status(404).json({ error: 'Gig not found' });
    }

    // Si el partId termina en '_paused', es de pausedInfo y necesitamos crear el missingPart
    if (partId.endsWith('_paused')) {
      // Migrar de pausedInfo a missingParts array
      if (gig.pausedInfo && gig.pausedInfo.reason === 'missing-parts') {
        if (!gig.missingParts) {
          gig.missingParts = [];
        }
        
        // Agregar al array de missingParts
        gig.missingParts.push({
          partNumber: partNumber || '',
          partName: gig.pausedInfo.note,
          quantity: 1,
          status: status || 'pending',
          addedAt: gig.pausedInfo.pausedAt,
          addedBy: gig.pausedInfo.pausedBy
        });

        await gig.save();

        return res.json({
          message: 'Part migrated and updated successfully',
          part: gig.missingParts[gig.missingParts.length - 1]
        });
      }
      return res.status(404).json({ error: 'Paused part not found' });
    }

    // Buscar en el array de missingParts
    if (!gig.missingParts || gig.missingParts.length === 0) {
      return res.status(404).json({ error: 'No missing parts found in this gig' });
    }

    const partIndex = gig.missingParts.findIndex(p => p._id.toString() === partId);
    if (partIndex === -1) {
      return res.status(404).json({ error: 'Part not found' });
    }

    // Actualizar campos
    if (status) {
      gig.missingParts[partIndex].status = status;
    }
    if (partNumber !== undefined) {
      gig.missingParts[partIndex].partNumber = partNumber;
    }

    await gig.save();

    res.json({
      message: 'Part updated successfully',
      part: gig.missingParts[partIndex]
    });
  } catch (error) {
    console.error('Error updating missing part:', error);
    res.status(400).json({ error: error.message });
  }
});

// Get a gig by ID (DEBE IR DESPUÉS DE LAS RUTAS ESPECÍFICAS)
router.get("/:id", auth, async (req, res) => {
  try {
    const gig = await Gig.findById(req.params.id);

    if (!gig) {
      return res.status(404).json({ error: "Gig not found" });
    }

    if (req.userRole === 'qc' || req.userRole === 'admin') {
      return res.json(gig);
    }

    if (req.userRole === 'lead') {
      if (gig.station === req.userStation) {
        return res.json(gig);
      }
      const notification = await Notification.findOne({
        relatedGigId: gig._id,
        station: req.userStation
      });
      if (notification) {
        return res.json(gig);
      }
    }

    if (req.userRole === 'worker' && gig.station === req.userStation) {
      return res.json(gig);
    }

    return res.status(403).json({ error: "Do not have permission to view this gig" });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});


// Start gig (Worker/Lead)
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

    // Si es missing-parts, agregar al array de missingParts
    if (reason === 'missing-parts' && note) {
      if (!gig.missingParts) {
        gig.missingParts = [];
      }
      
      gig.missingParts.push({
        partNumber: '',
        partName: note,
        quantity: 1,
        notes: '',
        addedAt: new Date(),
        addedBy: {
          workerNumber,
          workerName
        },
        status: 'pending'
      });
    }

    await gig.save();

    // Crear notificación
    if (reason === 'missing-parts' || reason === 'depends-previous-station') {
      const notificationTitle = reason === 'missing-parts' 
        ? '⚠️ Missing Part Alert' 
        : '🔗 Gig Dependency Alert';
      
      const notificationMessage = reason === 'missing-parts'
        ? `Missing Part: "${note}". Truck: ${gig.truckNumber}, Station: ${gig.station}`
        : `Gig depends on previous station. Truck: ${gig.truckNumber}, Station: ${gig.station}. Note: ${note || 'N/A'}`;

      const notification = new Notification({
        type: reason,
        title: notificationTitle,
        message: notificationMessage,
        station: gig.station,
        targetRole: reason === 'missing-parts' ? 'admin' : 'lead',
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

    if (req.userRole === "qc") {
      Object.assign(gig, req.body);
    } else if (req.userRole === "lead") {
      if (gig.station !== req.userStation) {
        return res
          .status(403)
          .json({ error: "Do not have permission to edit this gig" });
      }
      if (req.body.photos) gig.photos = req.body.photos;
      if (req.body.inspectorId) gig.inspectorId = req.body.inspectorId;
    } else if (req.userRole === "worker") {
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
