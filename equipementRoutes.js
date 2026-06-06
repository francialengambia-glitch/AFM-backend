const express = require('express');
const router = express.Router();
const equipementController = require('../controllers/equipementController');

// Route pour obtenir les équipements
router.get('/equipements', equipementController.getAllEquipements);

module.exports = router;
