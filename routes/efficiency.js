const express = require('express');
const router = express.Router();
const Gig = require('../models/Gig');
const Task = require('../models/Task');
const Operator = require('../models/Operator');
const auth = require('../middleware/auth');

// Get worker efficiency for a specific date
router.get('/daily/:date', auth, async (req, res) => {
  try {
    // Solo leads pueden ver eficiencia
    if (req.userRole !== 'lead' && req.userRole !== 'qc' && req.userRole !== 'admin') {
      return res.status(403).json({ error: 'No permission to view efficiency data' });
    }

    const { date } = req.params;
    const targetDate = new Date(date);
    targetDate.setHours(0, 0, 0, 0);
    
    const nextDay = new Date(targetDate);
    nextDay.setDate(nextDay.getDate() + 1);

    // Filtro por estación si es lead
    let stationFilter = {};
    if (req.userRole === 'lead') {
      stationFilter = { station: req.userStation };
    }

    // Obtener todos los gigs completados en esa fecha
    const completedGigs = await Gig.find({
      ...stationFilter,
      'completedBy.completedAt': { $gte: targetDate, $lt: nextDay },
      status: 'completed'
    });

    // Obtener todos los tasks completados en esa fecha
    const completedTasks = await Task.find({
      ...stationFilter,
      'completedBy.completedAt': { $gte: targetDate, $lt: nextDay },
      status: 'completed'
    });

    // Agrupar por trabajador
    const workerStats = {};

    // Procesar gigs
    completedGigs.forEach(gig => {
      if (gig.startedBy && gig.completedBy) {
        const workerNum = gig.completedBy.workerNumber;
        const workerName = gig.completedBy.workerName;
        
        if (!workerStats[workerNum]) {
          workerStats[workerNum] = {
            employeeNumber: workerNum,
            employeeName: workerName,
            station: gig.station,
            totalWorkMinutes: 0,
            gigsCompleted: 0,
            tasksCompleted: 0,
            sessions: []
          };
        }

        const startTime = new Date(gig.startedBy.startedAt);
        const endTime = new Date(gig.completedBy.completedAt);
        const durationMinutes = Math.round((endTime - startTime) / (1000 * 60));

        workerStats[workerNum].totalWorkMinutes += durationMinutes;
        workerStats[workerNum].gigsCompleted += 1;
        workerStats[workerNum].sessions.push({
          type: 'gig',
          id: gig._id,
          description: gig.description.substring(0, 50) + '...',
          startTime,
          endTime,
          durationMinutes
        });
      }
    });

    // Procesar tasks
    completedTasks.forEach(task => {
      if (task.startedBy && task.completedBy) {
        const workerNum = task.completedBy.workerNumber;
        const workerName = task.completedBy.workerName;
        
        if (!workerStats[workerNum]) {
          workerStats[workerNum] = {
            employeeNumber: workerNum,
            employeeName: workerName,
            station: task.station,
            totalWorkMinutes: 0,
            gigsCompleted: 0,
            tasksCompleted: 0,
            sessions: []
          };
        }

        const startTime = new Date(task.startedBy.startedAt);
        const endTime = new Date(task.completedBy.completedAt);
        const durationMinutes = Math.round((endTime - startTime) / (1000 * 60));

        workerStats[workerNum].totalWorkMinutes += durationMinutes;
        workerStats[workerNum].tasksCompleted += 1;
        workerStats[workerNum].sessions.push({
          type: 'task',
          id: task._id,
          description: task.taskName,
          startTime,
          endTime,
          durationMinutes
        });
      }
    });

    // Convertir a array y calcular eficiencia
    const WORK_DAY_MINUTES = 600; // 10 horas = 600 minutos
    
    const efficiencyData = Object.values(workerStats).map(worker => ({
      ...worker,
      totalWorkHours: Math.round((worker.totalWorkMinutes / 60) * 100) / 100,
      efficiencyPercentage: Math.round((worker.totalWorkMinutes / WORK_DAY_MINUTES) * 100),
      totalItemsCompleted: worker.gigsCompleted + worker.tasksCompleted
    })).sort((a, b) => b.efficiencyPercentage - a.efficiencyPercentage);

    res.json({
      date: targetDate.toISOString().split('T')[0],
      workDayMinutes: WORK_DAY_MINUTES,
      workDayHours: 10,
      totalWorkers: efficiencyData.length,
      workers: efficiencyData
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get worker efficiency for a date range
router.get('/range', auth, async (req, res) => {
  try {
    if (req.userRole !== 'lead' && req.userRole !== 'qc' && req.userRole !== 'admin') {
      return res.status(403).json({ error: 'No permission to view efficiency data' });
    }

    const { startDate, endDate, employeeNumber } = req.query;

    if (!startDate || !endDate) {
      return res.status(400).json({ error: 'Start and end dates are required' });
    }

    const start = new Date(startDate);
    start.setHours(0, 0, 0, 0);
    
    const end = new Date(endDate);
    end.setHours(23, 59, 59, 999);

    let stationFilter = {};
    if (req.userRole === 'lead') {
      stationFilter = { station: req.userStation };
    }

    let workerFilter = {};
    if (employeeNumber) {
      workerFilter = { 'completedBy.workerNumber': employeeNumber };
    }

    const completedGigs = await Gig.find({
      ...stationFilter,
      ...workerFilter,
      'completedBy.completedAt': { $gte: start, $lte: end },
      status: 'completed'
    });

    const completedTasks = await Task.find({
      ...stationFilter,
      ...workerFilter,
      'completedBy.completedAt': { $gte: start, $lte: end },
      status: 'completed'
    });

    // Agrupar por día y trabajador
    const dailyStats = {};

    [...completedGigs, ...completedTasks].forEach(item => {
      if (item.startedBy && item.completedBy) {
        const dateKey = new Date(item.completedBy.completedAt).toISOString().split('T')[0];
        const workerNum = item.completedBy.workerNumber;
        const key = `${dateKey}_${workerNum}`;

        if (!dailyStats[key]) {
          dailyStats[key] = {
            date: dateKey,
            employeeNumber: workerNum,
            employeeName: item.completedBy.workerName,
            station: item.station,
            totalWorkMinutes: 0,
            itemsCompleted: 0
          };
        }

        const startTime = new Date(item.startedBy.startedAt);
        const endTime = new Date(item.completedBy.completedAt);
        const durationMinutes = Math.round((endTime - startTime) / (1000 * 60));

        dailyStats[key].totalWorkMinutes += durationMinutes;
        dailyStats[key].itemsCompleted += 1;
      }
    });

    const WORK_DAY_MINUTES = 600;
    const results = Object.values(dailyStats).map(stat => ({
      ...stat,
      totalWorkHours: Math.round((stat.totalWorkMinutes / 60) * 100) / 100,
      efficiencyPercentage: Math.round((stat.totalWorkMinutes / WORK_DAY_MINUTES) * 100)
    })).sort((a, b) => new Date(b.date) - new Date(a.date));

    res.json({
      startDate: startDate,
      endDate: endDate,
      totalRecords: results.length,
      data: results
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
