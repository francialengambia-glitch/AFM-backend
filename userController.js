const pool = require('../config/db');

// Récupérer tous les utilisateurs
const getAllUsers = async (req, res) => {
    try {
        // En utilisant *, PostgreSQL ne bloquera plus sur le nom de la colonne id
        const result = await pool.query('SELECT * FROM utilisateurs');
        
        // Sécurité : On enlève le mot de passe de chaque utilisateur avant d'envoyer
        const users = result.rows.map(({ mot_de_passe, ...user }) => user);
        
        res.status(200).json(users);
    } catch (error) {
        console.error("Erreur PostgreSQL :", error.message);
        res.status(500).json({ 
            message: "Erreur lors de la récupération des utilisateurs", 
            erreur_exacte: error.message 
        });
    }
};
const bcrypt = require('bcrypt'); // N'oublie pas d'ajouter cette ligne en haut du fichier

const loginUser = async (req, res) => {
    const { email, mot_de_passe } = req.body;
    try {
        // 1. Chercher l'utilisateur dans la base
        const result = await pool.query('SELECT * FROM utilisateurs WHERE email = $1', [email]);
        
        if (result.rows.length === 0) {
            return res.status(401).json({ success: false, message: "Identifiants incorrects." });
        }

        const user = result.rows[0];

        // 2. Comparer le mot de passe reçu avec le hash stocké
        console.log("Comparaison :", mot_de_passe, "avec", user.mot_de_passe);
        
        const match = await bcrypt.compare(mot_de_passe, user.mot_de_passe);
        
        if (match) {
            // Connexion réussie
            res.status(200).json({ success: true, message: "Connexion réussie", user: { nom: user.nom, role: user.role } });
        } else {
            res.status(401).json({ success: false, message: "Identifiants incorrects." });
        }
    } catch (error) {
        res.status(500).json({ success: false, message: "Erreur serveur" });
    }
};

// N'oublie pas d'exporter la nouvelle fonction !
module.exports = {
    getAllUsers,
    loginUser
};
