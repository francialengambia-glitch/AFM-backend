const pool = require('../config/db');

// Récupérer tous les symptômes de pannes enregistrés
const getAllSymptomes = async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM symptomes');
        res.status(200).json(result.rows);
    } catch (error) {
        console.error("Erreur PostgreSQL :", error.message);
        res.status(500).json({ 
            message: "Erreur lors de la récupération des symptômes", 
            erreur_exacte: error.message 
        });
    }
};

module.exports = {
    getAllSymptomes
};
