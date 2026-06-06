const express = require('express');
const router = express.Router();

// Importation sécurisée de la fonction depuis le contrôleur
const { getAllTickets } = require('../controllers/ticketController');

// Route pour obtenir tous les tickets
router.get('/tickets', getAllTickets);

module.exports = router;
