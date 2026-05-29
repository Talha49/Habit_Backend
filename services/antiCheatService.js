/**
 * Anti-Cheating Data Validation Service
 *
 * Implements four sub-systems:
 *  1. GPS Activity Validation   – accuracy + mocked-location detection
 *  2. In-App Timer Validation   – elapsed time meets habit requirement
 *  3. Behavior Anomaly Detection – impossible-speed detection across check-ins
 *  4. Data Integrity Checks     – writes immutable audit trail to ValidationLog
 */

const ValidationLog = require('../models/v1/ValidationLog');
const HabitLog = require('../models/v1/HabitLog');

// ─── CONSTANTS ────────────────────────────────────────────────────────────────
const GPS_ACCURACY_LIMIT_M   = 200;   // Reject GPS readings worse than 200 m
const HUMAN_SPEED_LIMIT_KPH  = 130;   // Above this → anomaly (e.g. car, teleport)
const MIN_TIMER_FRACTION     = 0.8;   // Must complete ≥ 80 % of required time

// ─── HELPERS ─────────────────────────────────────────────────────────────────

/**
 * Haversine distance between two GPS coordinates (returns km)
 */
const haversineKm = (lat1, lon1, lat2, lon2) => {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
};

/**
 * Write a single row to the ValidationLog (immutable audit trail).
 */
const writeAuditLog = (userId, habitId, habitLogId, checkType, status, reason, extra = {}) =>
  ValidationLog.create({ userId, habitId, habitLogId, checkType, status, reason, ...extra })
    .catch(err => console.warn('⚠️ ValidationLog write failed (non-critical):', err.message));

// ─── SUB-SYSTEM 1: GPS VALIDATION ────────────────────────────────────────────

/**
 * Validates the GPS payload sent by the client.
 * Returns { ok, reason }
 */
const validateGPS = (gpsData) => {
  if (!gpsData || gpsData.lat == null || gpsData.lon == null) {
    return { ok: false, reason: 'No GPS data provided' };
  }

  // Mocked / fake location flag set by the device OS
  if (gpsData.mockedLocation === true) {
    return { ok: false, reason: 'Mocked/fake GPS location detected' };
  }

  // Accuracy sanity check (null accuracy → treat as suspicious)
  if (gpsData.accuracy == null || gpsData.accuracy > GPS_ACCURACY_LIMIT_M) {
    return {
      ok: false,
      reason: `GPS accuracy too low (${gpsData.accuracy ?? 'unknown'} m). Required < ${GPS_ACCURACY_LIMIT_M} m`,
    };
  }

  return { ok: true, reason: 'GPS validated' };
};

// ─── SUB-SYSTEM 2: TIMER VALIDATION ─────────────────────────────────────────

/**
 * Validates that the user actually spent enough time on a timed habit.
 * Returns { ok, reason }
 */
const validateTimer = (timerData, habit) => {
  // Only enforce for habits with a requiredDuration set
  if (!habit.requiredDuration || habit.requiredDuration === 0) {
    return { ok: true, reason: 'No timer requirement' };
  }

  if (!timerData || timerData.elapsedSeconds == null) {
    return { ok: false, reason: 'Timer data missing for a timed habit' };
  }

  const required = habit.requiredDuration;          // seconds stored on Habit
  const elapsed  = timerData.elapsedSeconds;
  const fraction = elapsed / required;

  if (fraction < MIN_TIMER_FRACTION) {
    return {
      ok: false,
      reason: `Timer too short. Elapsed ${elapsed}s / required ${required}s (${Math.round(fraction * 100)}%)`,
    };
  }

  return { ok: true, reason: `Timer passed (${elapsed}s / ${required}s)` };
};

// ─── SUB-SYSTEM 3: BEHAVIOR ANOMALY DETECTION ────────────────────────────────

/**
 * Detects impossible location jumps between consecutive check-ins.
 * Returns { ok, reason, anomalyData }
 */
const detectAnomalies = async (userId, currentGPS, currentTime) => {
  if (!currentGPS || currentGPS.lat == null) {
    return { ok: true, reason: 'No GPS – anomaly check skipped' };
  }

  // Fetch the most recent VERIFIED log for this user that has GPS data
  const prev = await HabitLog.findOne({
    userId,
    validationStatus: 'verified',
    'gpsData.lat': { $exists: true },
  }).sort({ completedAt: -1 });

  if (!prev || !prev.gpsData?.lat) {
    return { ok: true, reason: 'No previous GPS log – baseline established' };
  }

  const distKm         = haversineKm(prev.gpsData.lat, prev.gpsData.lon, currentGPS.lat, currentGPS.lon);
  const elapsedSeconds = (new Date(currentTime) - new Date(prev.completedAt)) / 1000;
  const speedKph       = elapsedSeconds > 0 ? (distKm / elapsedSeconds) * 3600 : 0;

  const anomalyData = {
    prevLat: prev.gpsData.lat,
    prevLon: prev.gpsData.lon,
    prevCompletedAt: prev.completedAt,
    distanceKm: +distKm.toFixed(4),
    timeElapsedSeconds: +elapsedSeconds.toFixed(1),
    speedKph: +speedKph.toFixed(2),
    humanSpeedLimitKph: HUMAN_SPEED_LIMIT_KPH,
  };

  if (speedKph > HUMAN_SPEED_LIMIT_KPH) {
    return {
      ok: false,
      reason: `Impossible speed detected: ${speedKph.toFixed(1)} km/h over ${distKm.toFixed(2)} km in ${Math.round(elapsedSeconds)}s`,
      anomalyData,
    };
  }

  return { ok: true, reason: `Speed OK (${speedKph.toFixed(1)} km/h)`, anomalyData };
};

// ─── MAIN ENTRY POINT ─────────────────────────────────────────────────────────

/**
 * Runs all four validation sub-systems on a single check-in attempt.
 *
 * @param {Object} params
 * @param {ObjectId} params.userId
 * @param {Object}  params.habit      – Mongoose Habit document
 * @param {Object}  params.gpsData    – { lat, lon, accuracy, provider, mockedLocation }
 * @param {Object}  params.timerData  – { requiredSeconds, elapsedSeconds, startedAt }
 * @param {Date}    params.now        – current timestamp
 *
 * @returns {{ finalStatus: 'verified'|'flagged', validationSummary: Object }}
 */
const runValidation = async ({ userId, habit, habitLogId, gpsData, timerData, now }) => {
  const results = {};
  let flagged = false;

  // --- 1. GPS Validation ---
  const gpsResult = validateGPS(gpsData);
  results.gps = gpsResult;
  if (!gpsResult.ok) {
    flagged = true;
    await writeAuditLog(userId, habit._id, habitLogId, 'gps_validation', 'flagged', gpsResult.reason, {
      gpsData,
    });
  } else {
    await writeAuditLog(userId, habit._id, habitLogId, 'gps_validation', 'passed', gpsResult.reason, {
      gpsData,
    });
  }

  // --- 2. Timer Validation ---
  const timerResult = validateTimer(timerData, habit);
  results.timer = timerResult;
  if (!timerResult.ok) {
    flagged = true;
    await writeAuditLog(userId, habit._id, habitLogId, 'timer_validation', 'flagged', timerResult.reason, {
      timerData,
    });
  } else {
    await writeAuditLog(userId, habit._id, habitLogId, 'timer_validation', 'passed', timerResult.reason, {
      timerData,
    });
  }

  // --- 3. Anomaly Detection ---
  const anomalyResult = await detectAnomalies(userId, gpsData, now);
  results.anomaly = anomalyResult;
  if (!anomalyResult.ok) {
    flagged = true;
    await writeAuditLog(userId, habit._id, habitLogId, 'anomaly_detection', 'flagged', anomalyResult.reason, {
      anomalyData: anomalyResult.anomalyData,
    });
  } else {
    await writeAuditLog(userId, habit._id, habitLogId, 'anomaly_detection', 'passed', anomalyResult.reason, {
      anomalyData: anomalyResult.anomalyData,
    });
  }

  // --- 4. Data Integrity (overall audit record) ---
  const finalStatus = flagged ? 'flagged' : 'verified';
  await writeAuditLog(
    userId,
    habit._id,
    habitLogId,
    'integrity_check',
    finalStatus === 'verified' ? 'passed' : 'flagged',
    finalStatus === 'verified'
      ? 'All integrity checks passed'
      : 'One or more checks failed – entry flagged for review',
  );

  console.log(`🛡️  Anti-Cheat [${habit.title}]: ${finalStatus.toUpperCase()} | GPS:${gpsResult.ok ? '✅' : '❌'} Timer:${timerResult.ok ? '✅' : '❌'} Anomaly:${anomalyResult.ok ? '✅' : '❌'}`);

  return { finalStatus, validationSummary: results };
};

module.exports = { runValidation, validateGPS, validateTimer, detectAnomalies };
