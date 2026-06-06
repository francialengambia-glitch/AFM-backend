const pool = require('../config/db');

// Récupérer tous les utilisateurs
const getAllUsers = async (req, res) => {
    try {
        // Correction ici : on trie par 'id' et non 'id_utilisateur'
        const result = await pool.query('SELECT * FROM utilisateurs ORDER BY id ASC');
        res.status(200).json(result.rows);
    } catch (error) {
        console.error("Erreur PostgreSQL :", error.message);
        res.status(500).json({ 
            message: "Erreur lors de la récupération des utilisateurs", 
            erreur_exacte: error.message 
        });
    }
};

module.exports = {
    getAllUsers
};
