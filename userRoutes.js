const express = require('express');
const router = express.Router();
const { loginUser, getAllUsers } = require('../controllers/userController');

// Route pour récupérer tous les utilisateurs
router.get('/users', getAllUsers);

// Variante 1 : Si ton frontend appelle /api/login
router.post('/login', loginUser);

// Variante 2 : Si ton frontend appelle /api/users/login
router.post('/users/login', loginUser);

module.exports = router;
