const express = require('express');
const router = express.Router();
const symptomeController = require('../controllers/symptomeController');

// Route pour obtenir la liste des symptômes
router.get('/symptomes', symptomeController.getAllSymptomes);

module.exports = router;
