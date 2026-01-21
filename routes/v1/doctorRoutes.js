const express = require('express');
const router = express.Router();
const doctorController = require('../../controllers/v1/doctorController');
const { requireAuth } = require('../../middleware/requireAuth');

// GET /v1/doctor/patients - List linked patients
router.get('/patients', requireAuth, doctorController.getPatients);

// GET /v1/doctor/patients/:patientId - Get specific patient data
router.get('/patients/:patientId', requireAuth, doctorController.getPatientData);

module.exports = router;
