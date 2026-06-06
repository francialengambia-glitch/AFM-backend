const pool = require('../config/db');

// Récupérer tous les équipements du parc infrastructurel
const getAllEquipements = async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM equipements');
        res.status(200).json(result.rows);
    } catch (error) {
        console.error("Erreur PostgreSQL :", error.message);
        res.status(500).json({ 
            message: "Erreur lors de la récupération des équipements", 
            erreur_exacte: error.message 
        });
    }
};

module.exports = {
    getAllEquipements
};
