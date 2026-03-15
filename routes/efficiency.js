const express = require('express');
const router = express.Router();
const Gig = require('../models/Gig');
const Task = require('../models/Task');
const Operator = require('../models/Operator');
const auth = require('../middleware/auth');

// Constante: 10 horas = 600 minutos
const WORK_DAY_MINUTES = 600;

// GET Daily Efficiency - Eficiencia diaria por operador
router.get('/daily/:date', auth, async (req, res) => {
  try {
    const { date } = req.params;
    const userStation = req.userStation;
    const userRole = req.userRole;

    // Parsear la fecha
    const selectedDate = new Date(date + 'T00:00:00.000Z');
    const nextDay = new Date(selectedDate);
    nextDay.setUTCDate(nextDay.getUTCDate() + 1);

    console.log('Buscando eficiencia para fecha:', selectedDate.toISOString(), 'hasta:', nextDay.toISOString());
    console.log('Usuario rol:', userRole, 'estación:', userStation);

    // Filtro base por fecha - buscar gigs/tasks completados ese día
    const dateFilter = {
      'completedBy.completedAt': {
        $gte: selectedDate,
        $lt: nextDay
      },
      status: 'completed'
    };

    // Si es lead, filtrar solo por su estación
    if (userRole === 'lead' && userStation) {
      dateFilter.station = userStation;
    }

    // Obtener gigs completados ese día
    const completedGigs = await Gig.find(dateFilter);
    console.log('Gigs completados encontrados:', completedGigs.length);

    // Obtener tasks completados ese día
    const completedTasks = await Task.find(dateFilter);
    console.log('Tasks completados encontrados:', completedTasks.length);

    // Agrupar por trabajador (workerNumber)
    const workerData = {};

    // Procesar Gigs
    completedGigs.forEach(gig => {
      const workerNumber = gig.completedBy?.workerNumber || gig.startedBy?.workerNumber;
      const workerName = gig.completedBy?.workerName || gig.startedBy?.workerName;
      
      if (!workerNumber) return;

      if (!workerData[workerNumber]) {
        workerData[workerNumber] = {
          employeeNumber: workerNumber,
          employeeName: workerName || 'Unknown',
          station: gig.station,
          totalWorkMinutes: 0,
          gigsCompleted: 0,
          tasksCompleted: 0,
          sessions: []
        };
      }

      // Calcular duración del gig (startedAt -> completedAt)
      const startTime = gig.startedBy?.startedAt;
      const endTime = gig.completedBy?.completedAt;

      if (startTime && endTime) {
        const durationMs = new Date(endTime) - new Date(startTime);
        const durationMinutes = Math.round(durationMs / 60000);

        if (durationMinutes > 0 && durationMinutes < WORK_DAY_MINUTES) {
          workerData[workerNumber].totalWorkMinutes += durationMinutes;
          workerData[workerNumber].gigsCompleted++;
          workerData[workerNumber].sessions.push({
            type: 'gig',
            description: gig.description,
            truckNumber: gig.truckNumber,
            startTime: startTime,
            endTime: endTime,
            durationMinutes: durationMinutes
          });
        }
      }
    });

    // Procesar Tasks
    completedTasks.forEach(task => {
      const workerNumber = task.completedBy?.workerNumber || task.startedBy?.workerNumber;
      const workerName = task.completedBy?.workerName || task.startedBy?.workerName;
      
      if (!workerNumber) return;

      if (!workerData[workerNumber]) {
        workerData[workerNumber] = {
          employeeNumber: workerNumber,
          employeeName: workerName || 'Unknown',
          station: task.station,
          totalWorkMinutes: 0,
          gigsCompleted: 0,
          tasksCompleted: 0,
          sessions: []
        };
      }

      // Calcular duración del task
      const startTime = task.startedBy?.startedAt;
      const endTime = task.completedBy?.completedAt;

      if (startTime && endTime) {
        const durationMs = new Date(endTime) - new Date(startTime);
        const durationMinutes = Math.round(durationMs / 60000);

        if (durationMinutes > 0 && durationMinutes < WORK_DAY_MINUTES) {
          workerData[workerNumber].totalWorkMinutes += durationMinutes;
          workerData[workerNumber].tasksCompleted++;
          workerData[workerNumber].sessions.push({
            type: 'task',
            description: task.taskName + ' - ' + task.description,
            truckNumber: task.truckNumber,
            startTime: startTime,
            endTime: endTime,
            durationMinutes: durationMinutes
          });
        }
      }
    });

    // Calcular eficiencia para cada trabajador
    // Fórmula: Eficiencia(%) = (Minutos / 600) × 100
    const workers = Object.values(workerData).map(worker => {
      // Limitar a 600 minutos máximo para el cálculo
      const effectiveMinutes = Math.min(worker.totalWorkMinutes, WORK_DAY_MINUTES);
      const efficiencyPercentage = Math.round((effectiveMinutes / WORK_DAY_MINUTES) * 100);

      return {
        ...worker,
        efficiencyPercentage: efficiencyPercentage,
        // Ordenar sesiones por hora de inicio
        sessions: worker.sessions.sort((a, b) => new Date(a.startTime) - new Date(b.startTime))
      };
    });

    // Ordenar trabajadores por eficiencia (mayor a menor)
    workers.sort((a, b) => b.efficiencyPercentage - a.efficiencyPercentage);

    res.json({
      date: date,
      station: userRole === 'lead' ? userStation : 'All Stations',
      workDayHours: 10,
      workDayMinutes: WORK_DAY_MINUTES,
      totalWorkers: workers.length,
      workers: workers
    });

  } catch (error) {
    console.error('Error en efficiency/daily:', error);
    res.status(500).json({ error: error.message });
  }
});

// GET Weekly Efficiency Summary
router.get('/weekly/:startDate', auth, async (req, res) => {
  try {
    const { startDate } = req.params;
    const userStation = req.userStation;
    const userRole = req.userRole;

    const weekStart = new Date(startDate + 'T00:00:00.000Z');
    const weekEnd = new Date(weekStart);
    weekEnd.setUTCDate(weekEnd.getUTCDate() + 7);

    const dateFilter = {
      'completedBy.completedAt': {
        $gte: weekStart,
        $lt: weekEnd
      },
      status: 'completed'
    };

    if (userRole === 'lead' && userStation) {
      dateFilter.station = userStation;
    }

    const completedGigs = await Gig.find(dateFilter);
    const completedTasks = await Task.find(dateFilter);

    // Agrupar por día
    const dailyData = {};

    const processItem = (item, type) => {
      const completedAt = item.completedBy?.completedAt;
      if (!completedAt) return;

      const dayKey = new Date(completedAt).toISOString().split('T')[0];
      
      if (!dailyData[dayKey]) {
        dailyData[dayKey] = {
          date: dayKey,
          totalMinutes: 0,
          gigsCompleted: 0,
          tasksCompleted: 0,
          workers: new Set()
        };
      }

      const startTime = item.startedBy?.startedAt;
      const endTime = item.completedBy?.completedAt;

      if (startTime && endTime) {
        const durationMinutes = Math.round((new Date(endTime) - new Date(startTime)) / 60000);
        if (durationMinutes > 0 && durationMinutes < WORK_DAY_MINUTES) {
          dailyData[dayKey].totalMinutes += durationMinutes;
          if (type === 'gig') {
            dailyData[dayKey].gigsCompleted++;
          } else {
            dailyData[dayKey].tasksCompleted++;
          }
          const workerNumber = item.completedBy?.workerNumber || item.startedBy?.workerNumber;
          if (workerNumber) {
            dailyData[dayKey].workers.add(workerNumber);
          }
        }
      }
    };

    completedGigs.forEach(gig => processItem(gig, 'gig'));
    completedTasks.forEach(task => processItem(task, 'task'));

    // Calcular eficiencia diaria promedio
    const weeklyStats = Object.values(dailyData).map(day => ({
      ...day,
      workersCount: day.workers.size,
      avgEfficiency: day.workers.size > 0 
        ? Math.round((day.totalMinutes / (day.workers.size * WORK_DAY_MINUTES)) * 100)
        : 0
    }));

    res.json({
      weekStart: startDate,
      station: userRole === 'lead' ? userStation : 'All Stations',
      dailyStats: weeklyStats.sort((a, b) => a.date.localeCompare(b.date))
    });

  } catch (error) {
    console.error('Error en efficiency/weekly:', error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;