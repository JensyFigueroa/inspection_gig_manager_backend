const express = require('express');
const router = express.Router();
const DPURecord = require('../models/DPURecord');
const auth = require('../middleware/auth');

function getWeekDates(date = new Date()) {
  const curr = new Date(date);
  const first = curr.getDate() - curr.getDay();
  
  const currentWeekStart = new Date(curr.setDate(first));
  currentWeekStart.setHours(0, 0, 0, 0);
  
  const currentWeekEnd = new Date(currentWeekStart);
  currentWeekEnd.setDate(currentWeekStart.getDate() + 6);
  currentWeekEnd.setHours(23, 59, 59, 999);
  
  const previousWeekStart = new Date(currentWeekStart);
  previousWeekStart.setDate(currentWeekStart.getDate() - 7);
  
  const previousWeekEnd = new Date(previousWeekStart);
  previousWeekEnd.setDate(previousWeekStart.getDate() + 6);
  previousWeekEnd.setHours(23, 59, 59, 999);
  
  return {
    currentWeek: { start: currentWeekStart, end: currentWeekEnd },
    previousWeek: { start: previousWeekStart, end: previousWeekEnd }
  };
}

router.get('/weekly-comparison/:line', auth, async (req, res) => {
  try {
    const { line } = req.params;
    const { currentWeek, previousWeek } = getWeekDates();

    const currentWeekData = await DPURecord.find({
      line: line,
      weekStartDate: { $gte: currentWeek.start, $lte: currentWeek.end }
    }).sort({ station: 1 });

    const previousWeekData = await DPURecord.find({
      line: line,
      weekStartDate: { $gte: previousWeek.start, $lte: previousWeek.end }
    }).sort({ station: 1 });

    const stations = [
      'ST1', 'ST2', 'ST3', 'ST4', 'ST5', 'ST6',
      'TS', 'Harn', 'Prep', 'Cabinet', 'Body', 'Paint'
    ];

    const currentMap = {};
    const previousMap = {};
    
    currentWeekData.forEach(record => {
      currentMap[record.station] = record.dpu;
    });
    
    previousWeekData.forEach(record => {
      previousMap[record.station] = record.dpu;
    });

    const comparisonData = stations.map(station => ({
      station,
      currentWeekDPU: currentMap[station] || 0,
      previousWeekDPU: previousMap[station] || 0,
      change: ((currentMap[station] || 0) - (previousMap[station] || 0)).toFixed(2)
    }));

    res.json({
      line,
      currentWeek: {
        start: currentWeek.start,
        end: currentWeek.end,
        label: `${currentWeek.start.toLocaleDateString('en-US', { month: 'numeric', day: 'numeric', year: 'numeric' })}`
      },
      previousWeek: {
        start: previousWeek.start,
        end: previousWeek.end,
        label: `${previousWeek.start.toLocaleDateString('en-US', { month: 'numeric', day: 'numeric', year: 'numeric' })}`
      },
      data: comparisonData
    });

  } catch (error) {
    console.error('DPU comparison error:', error);
    res.status(500).json({ error: error.message });
  }
});

router.get('/current-week/:line', auth, async (req, res) => {
  try {
    const { line } = req.params;
    const { currentWeek } = getWeekDates();

    const records = await DPURecord.find({
      line: line,
      weekStartDate: { $gte: currentWeek.start, $lte: currentWeek.end }
    }).sort({ dpu: -1 });

    res.json({
      line,
      week: {
        start: currentWeek.start,
        end: currentWeek.end
      },
      records
    });

  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/', auth, async (req, res) => {
  try {
    const { weekStartDate, line, station, totalUnitsInspected, totalDefects } = req.body;

    const start = new Date(weekStartDate);
    start.setHours(0, 0, 0, 0);
    const end = new Date(start);
    end.setDate(start.getDate() + 6);
    end.setHours(23, 59, 59, 999);

    let record = await DPURecord.findOne({
      weekStartDate: start,
      station,
      line
    });

    if (record) {
      record.totalUnitsInspected = totalUnitsInspected;
      record.totalDefects = totalDefects;
    } else {
      record = new DPURecord({
        weekStartDate: start,
        weekEndDate: end,
        line,
        station,
        totalUnitsInspected,
        totalDefects,
        createdBy: req.userId
      });
    }

    await record.save();
    res.json(record);

  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

router.post('/bulk', auth, async (req, res) => {
  try {
    const { records } = req.body;
    const results = [];

    for (const record of records) {
      const start = new Date(record.weekStartDate);
      start.setHours(0, 0, 0, 0);
      const end = new Date(start);
      end.setDate(start.getDate() + 6);
      end.setHours(23, 59, 59, 999);

      const dpu = record.totalUnitsInspected > 0 
        ? parseFloat((record.totalDefects / record.totalUnitsInspected).toFixed(2))
        : 0;

      const dpuRecord = await DPURecord.findOneAndUpdate(
        { weekStartDate: start, station: record.station, line: record.line },
        {
          weekStartDate: start,
          weekEndDate: end,
          line: record.line,
          station: record.station,
          totalUnitsInspected: record.totalUnitsInspected,
          totalDefects: record.totalDefects,
          dpu: dpu,
          createdBy: req.userId
        },
        { upsert: true, new: true }
      );
      
      results.push(dpuRecord);
    }

    res.json({ created: results.length, records: results });

  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

router.get('/', auth, async (req, res) => {
  try {
    const records = await DPURecord.find().sort({ weekStartDate: -1, station: 1 });
    res.json(records);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.delete('/:id', auth, async (req, res) => {
  try {
    await DPURecord.findByIdAndDelete(req.params.id);
    res.json({ message: 'Record deleted' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;