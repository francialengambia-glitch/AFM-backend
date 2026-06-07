require('dotenv').config();

const express = require('express');
const { Pool } = require('pg');
const session = require('express-session');
const path = require('path');
const bcrypt = require('bcrypt');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;

// ---------- CORS CONFIGURATION ----------
app.use(cors({
  origin: true, 
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'views'), { extensions: ['html'] }));

// ---------- SESSION ----------
app.use(session({
  secret: process.env.SESSION_SECRET || 'afm_secret_key_token_2026',
  resave: false,
  saveUninitialized: false,
  cookie: { secure: false, maxAge: 24 * 60 * 60 * 1000 }
}));

// ---------- POSTGRESQL POOL ----------
const pool = new Pool({
  user: process.env.PGUSER || 'postgres',
  host: process.env.PGHOST || 'localhost',
  database: process.env.PGDATABASE || 'AFM_BD',
  password: process.env.PGPASSWORD || 'francialehandy',
  port: parseInt(process.env.PGPORT || '5432', 10),
});

let hasTypeId = false;
let hasTypesEquipementTable = false;
let hasModelesTable = false;

async function verifySchemaOptions() {
  const tableExists = async (tableName) => {
    const { rows } = await pool.query(
      "SELECT EXISTS(SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name = $1)",
      [tableName]
    );
    return rows[0].exists;
  };

  const columnExists = async (tableName, columnName) => {
    const { rows } = await pool.query(
      "SELECT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name = $1 AND column_name = $2)",
      [tableName, columnName]
    );
    return rows[0].exists;
  };

  hasTypesEquipementTable = await tableExists('types_equipement');
  hasModelesTable = await tableExists('modeles');
  hasTypeId = await columnExists('infrastructures', 'type_id');

  if (!hasTypesEquipementTable) {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS types_equipement (
        id SERIAL PRIMARY KEY,
        nom_type VARCHAR(150) UNIQUE NOT NULL
      )
    `);
    hasTypesEquipementTable = true;
  }

  if (!hasTypeId) {
    await pool.query(`ALTER TABLE infrastructures ADD COLUMN IF NOT EXISTS type_id INTEGER`);
    hasTypeId = true;
  }

  if (!hasModelesTable) {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS modeles (
        id SERIAL PRIMARY KEY,
        nom_modele VARCHAR(150) NOT NULL,
        numero_serie VARCHAR(150),
        code_infrastructure VARCHAR(50) REFERENCES infrastructures(code_unique) ON DELETE SET NULL
      )
    `);
    hasModelesTable = true;
  }

  // Fonctionnalité 1 : Vérification et création automatique de la table de stockage des symptômes
  const hasSymptomesTable = await tableExists('symptomes');
  if (!hasSymptomesTable) {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS symptomes (
        id SERIAL PRIMARY KEY,
        nom_symptome VARCHAR(255) UNIQUE NOT NULL
      )
    `);
    console.log("🔹 Table 'symptomes' synchronisée en base de données.");
  }

  const hasTechnicienCol = await columnExists('tickets', 'technicien_assigne');
  if (!hasTechnicienCol) {
    try {
      await pool.query(`ALTER TABLE tickets ADD COLUMN IF NOT EXISTS technicien_assigne VARCHAR(150) DEFAULT NULL`);
      console.log("🔹 Colonne 'technicien_assigne' ajoutée avec succès à la table tickets.");
    } catch (err) {
      console.error("Erreur lors de la mise à jour de la structure de la table tickets :", err.message);
    }
  }

  // Fonctionnalité 2 : Ajout du drapeau de notification pour que l'opérateur sache quand afficher la modal box
  const hasNotificationVueCol = await columnExists('tickets', 'notification_annulee_vue');
  if (!hasNotificationVueCol) {
    try {
      await pool.query(`ALTER TABLE tickets ADD COLUMN IF NOT EXISTS notification_annulee_vue BOOLEAN DEFAULT FALSE`);
      console.log("🔹 Colonne 'notification_annulee_vue' initialisée.");
    } catch (err) {
      console.error("Erreur colonne notification_annulee_vue :", err.message);
    }
  }
}

(async function testDb() {
  try {
    await verifySchemaOptions();
    console.log(`⚡ Base de données AFM_BD synchronisée avec succès !`);
  } catch (err) {
    console.error('❌ Échec de synchronisation DB :', err.message);
  }
})();

async function getTypeTextualName(typeId) {
  const parsedId = parseInt(typeId, 10);
  if (!typeId || isNaN(parsedId)) return 'Autre';
  try {
    const { rows } = await pool.query("SELECT nom_type FROM types_equipement WHERE id = $1", [parsedId]);
    if (rows.length > 0) return rows[0].nom_type;
  } catch (e) {
    console.error('Erreur getTypeTextualName:', e.message);
  }
  return 'Autre';
}

function formatStatut(statutInput) {
  if (!statutInput) return 'Opérationnel';
  const s = statutInput.trim().toLowerCase();
  
  if (s === 'opérationnel' || s === 'operationnel') return 'Opérationnel';
  if (s === 'en panne') return 'En panne';
  if (s === 'maintenance') return 'Maintenance';
  
  return statutInput.charAt(0).toUpperCase() + statutInput.slice(1);
}

// Authentification et gestion des utilisateurs
app.post('/api/auth/login', async (req, res) => {
  const { email, mot_de_passe } = req.body;

  if (!email || !mot_de_passe) {
    return res.status(400).json({ success: false, message: "Veuillez remplir tous les champs." });
  }

  try {
    const result = await pool.query(
      'SELECT * FROM utilisateurs WHERE email = $1', [email]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({ success: false, message: "Identifiants incorrects." });
    }

    const user = result.rows[0];
    const match = await bcrypt.compare(mot_de_passe, user.mot_de_passe);

    if (!match) {
      return res.status(401).json({ success: false, message: "Identifiants incorrects." });
    }

    req.session.userId = user.id;
    req.session.email = user.email;
    req.session.role = user.role;

    return res.json({ success: true, role: user.role });

  } catch (err) {
    console.error(err);
    return res.status(500).json({ success: false, message: "Erreur serveur." });
  }
});


app.get('/api/auth/logout', (req, res) => {
    req.session.destroy((err) => {
        if (err) return res.status(500).send("Erreur de déconnexion.");
        res.redirect('/login.html');
    });
});

// CRUD - Infrastructures (Administrateur)
app.get('/api/infrastructures', (req, res) => {
    pool.query("SELECT * FROM infrastructures ORDER BY code_unique ASC", (err, results) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(results.rows);
    });
});

app.post('/api/infrastructures', (req, res) => {
    const { code_unique, nom_equipement, localisation, modele, numero_serie, date_installation, statut } = req.body;
    const sqlInsert = "INSERT INTO infrastructures (code_unique, nom_equipement, localisation, modele, numero_serie, date_installation, statut) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING code_unique";
    pool.query(sqlInsert, [code_unique, nom_equipement, localisation, modele, numero_serie, date_installation, statut], (err, result) => {
        if (err) return res.status(500).json({ success: false, error: err.message });
        res.json({ success: true, message: "Infrastructure insérée !", id: result.rows[0].code_unique });
    });
});

// GET un seul équipement par code_unique
app.get('/api/infrastructures/:code', (req, res) => {
  const code = req.params.code;
  pool.query(
    "SELECT * FROM infrastructures WHERE code_unique = $1",
    [code],
    (err, result) => {
      if (err) return res.status(500).json({ error: err.message });
      if (result.rows.length === 0) return res.status(404).json({ error: 'Non trouvé' });
      res.json(result.rows[0]);
    }
  );
});

app.put('/api/infrastructures/:code', (req, res) => {
    const code = req.params.code;
   const { nom_equipement, localisation, type_id, modele, numero_serie, date_installation, statut } = req.body;
   const sqlUpdate = "UPDATE infrastructures SET nom_equipement=$1, localisation=$2, type_id=$3, modele=$4, numero_serie=$5, date_installation=$6, statut=$7 WHERE code_unique=$8";
    pool.query(sqlUpdate, [nom_equipement, localisation, type_id, modele, numero_serie, date_installation, statut, code], (err, result) => {
        if (err) return res.status(500).json({ success: false, error: err.message });
        res.json({ success: true, message: "Infrastructure mise à jour." });
    });
});
// GET un seul équipement par code
app.get('/api/infrastructures/:code', (req, res) => {
  const code = req.params.code;
  pool.query(
    "SELECT * FROM infrastructures WHERE code_unique = $1",
    [code],
    (err, result) => {
      if (err) return res.status(500).json({ error: err.message });
      if (result.rows.length === 0) return res.status(404).json({ error: 'Non trouvé' });
      res.json(result.rows[0]);
    }
  );
});

app.delete('/api/infrastructures/:code', (req, res) => {
    const code = req.params.code;
    pool.query("DELETE FROM infrastructures WHERE code_unique = $1", [code], (err, result) => {
        if (err) return res.status(500).json({ success: false, error: err.message });
        res.json({ success: true, message: "Infrastructure supprimée." });
    });
});

// CRUD - Utilisateurs (Administrateur)
app.get('/api/utilisateurs', (req, res) => {
    pool.query("SELECT id, email, role FROM utilisateurs ORDER BY id DESC", (err, results) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(results.rows);
    });
});

app.post('/api/utilisateurs', async (req, res) => {
  const { email, role, mot_de_passe } = req.body;

  try {
    if (!mot_de_passe) {
  return res.status(400).json({ success: false, message: "Mot de passe requis." });
}
const mdpFinal = mot_de_passe;

    const sqlInsert = "INSERT INTO utilisateurs (email, role, mot_de_passe) VALUES ($1, $2, $3)";
    pool.query(sqlInsert, [email, role, hash], (err, result) => {
      if (err) return res.status(500).json({ success: false, error: err.message });
      res.json({ success: true, message: "Utilisateur créé." });
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.delete('/api/utilisateurs/:id', (req, res) => {
    const id = req.params.id;
    pool.query("DELETE FROM utilisateurs WHERE id = $1", [id], (err, result) => {
        if (err) return res.status(500).json({ success: false, error: err.message });
        res.json({ success: true, message: "Utilisateur révoqué." });
    });
});

// Opérateurs & Techniciens (Tickets)
app.get('/api/tickets', (req, res) => {
    pool.query("SELECT * FROM tickets ORDER BY date_creation DESC", (err, results) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(results.rows);
    });
});

app.put('/api/tickets/:id', (req, res) => {
    const id = req.params.id;
    const { etat, priorite, diagnostic_logic } = req.body;
    const sqlUpdate = "UPDATE tickets SET etat = $1, priorite = $2, diagnostic_logic = $3 WHERE id = $4";
    pool.query(sqlUpdate, [etat, priorite, diagnostic_logic, id], (err, result) => {
        if (err) return res.status(500).json({ success: false, error: err.message });
        res.json({ success: true, message: "Ticket mis à jour avec succès." });
    });
});

// Rapports Avancés (MTTR)
app.get('/api/rapports/gmao', (req, res) => {
    const queryMTTR = `
        SELECT 
            i.nom_equipement,
            i.code_unique,
            COUNT(t.id) AS total_pannes,
            ROUND(AVG(EXTRACT(EPOCH FROM (t.date_resolution - t.date_creation)) / 60)) AS mttr_minutes
        FROM infrastructures i
        LEFT JOIN tickets t ON i.code_unique = t.code_infrastructure
        WHERE t.etat = 'Terminé' OR t.etat IS NULL
        GROUP BY i.nom_equipement, i.code_unique
        ORDER BY total_pannes DESC
    `;
    pool.query(queryMTTR, (err, results) => {
        if (err) return res.status(500).json({ error: "Erreur statistiques PostgreSQL." });
        res.json({ generation_date: new Date(), analyse_parc: results.rows });
    });
});
// ---------- ENDPOINTS SYMPTOMES (NOUVEAU) ----------
// Récupérer la liste complète des symptômes
app.get('/api/symptomes', async (req, res) => {
  try {
    const { rows } = await pool.query("SELECT * FROM symptomes ORDER BY nom_symptome ASC");
    res.json(rows);
  } catch (err) {
    console.error('Erreur GET /api/symptomes :', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// Fonctionnalité 1 : Enregistrement autonome d'un symptôme personnalisé depuis l'application mobile
app.post('/api/symptomes', async (req, res) => {
  const { nom_symptome } = req.body;
  if (!nom_symptome || nom_symptome.trim() === '') {
    return res.status(400).json({ success: false, message: "Le nom du symptôme est requis." });
  }
  try {
    const sqlInsert = "INSERT INTO symptomes (nom_symptome) VALUES ($1) ON CONFLICT (nom_symptome) DO NOTHING RETURNING *";
    const { rows } = await pool.query(sqlInsert, [nom_symptome.trim()]);
    res.json({ success: true, message: "Symptôme enregistré automatiquement en BDD !", data: rows[0] || null });
  } catch (err) {
    console.error('Erreur POST /api/symptomes :', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ---------- ENDPOINTS TYPES EQUIPEMENT ----------
app.get('/api/types-equipement', async (req, res) => {
  try {
    if (!hasTypesEquipementTable) {
      return res.json([]);
    }
    const { rows } = await pool.query("SELECT id, nom_type FROM types_equipement ORDER BY nom_type ASC");
    res.json(rows);
  } catch (err) {
    console.error('/api/types-equipement GET error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/types-equipement', async (req, res) => {
  const { nom_type } = req.body;
  if (!nom_type) {
    return res.status(400).json({ success: false, message: "Le nom du type est requis." });
  }
  try {
    if (!hasTypesEquipementTable) {
      return res.status(500).json({ success: false, error: "Table non disponible." });
    }
    
    // Vérifie si le type existe déjà
    const existing = await pool.query(
      "SELECT id, nom_type FROM types_equipement WHERE nom_type = $1", [nom_type]
    );
    
    if (existing.rows.length > 0) {
      return res.json({ success: true, message: "Type deja existant.", data: existing.rows[0] });
    }
    
    // Insère si nouveau
    const { rows } = await pool.query(
      "INSERT INTO types_equipement (nom_type) VALUES ($1) RETURNING id, nom_type", [nom_type]
    );
    res.json({ success: true, message: "Type ajoute !", data: rows[0] });
    
  } catch (err) {
    console.error('/api/types-equipement POST error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ---------- DYNAMIQUE : Équipements filtrés par Type ID ----------
app.get('/api/equipements/filtres', async (req, res) => {
  const { type_id } = req.query;
  try {
    let sql = `
      SELECT i.code_unique, i.nom_equipement, i.localisation, e.modele, e.numero_serie, e.date_installation, e.statut, i.type_id
      FROM infrastructures i
      LEFT JOIN equipements e ON TRIM(UPPER(i.code_unique)) = TRIM(UPPER(e.nom))
    `;
    const params = [];
    const parsedTypeId = parseInt(type_id, 10);
    if (hasTypeId && type_id && !isNaN(parsedTypeId)) {
      sql += ' WHERE i.type_id = $1';
      params.push(parsedTypeId);
    }
    sql += ' ORDER BY i.nom_equipement ASC';
    const { rows } = await pool.query(sql, params);
    res.json(rows);
  } catch (err) {
    console.error('Erreur filtrage équipements /api/equipements/filtres:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

app.get('/api/infrastructures/filtres', async (req, res) => {
  const { type_id } = req.query;
  try {
    let sql = `
      SELECT i.code_unique, i.nom_equipement, i.localisation, e.modele, e.numero_serie, e.date_installation, e.statut, i.type_id
      FROM infrastructures i
      LEFT JOIN equipements e ON TRIM(UPPER(i.code_unique)) = TRIM(UPPER(e.nom))
    `;
    const params = [];
    const parsedTypeId = parseInt(type_id, 10);
    if (hasTypeId && type_id && !isNaN(parsedTypeId)) {
      sql += ' WHERE i.type_id = $1';
      params.push(parsedTypeId);
    }
    sql += ' ORDER BY i.nom_equipement ASC';
    const { rows } = await pool.query(sql, params);
    res.json(rows);
  } catch (err) {
    console.error('Erreur filtrage équipements /api/infrastructures/filtres:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ---------- DYNAMIQUE : Modèles filtrés pour l'application Mobile ----------
app.get('/api/modeles/filtres', async (req, res) => {
  const { code_infrastructure } = req.query;
  try {
    let sql = `
      SELECT 
        id_equipement AS id, 
        modele AS nom_modele, 
        numero_serie, 
        nom AS code_infrastructure 
      FROM equipements 
      WHERE modele IS NOT NULL AND modele <> ''
    `;
    const params = [];
    if (code_infrastructure && code_infrastructure.trim() !== '') {
      sql += ` 
        AND (
          TRIM(UPPER(nom)) = TRIM(UPPER($1)) 
          OR TRIM(UPPER(type_equipement)) = TRIM(UPPER($1))
        )
      `;
      params.push(code_infrastructure.trim());
    }
    sql += ' ORDER BY modele ASC';
    const { rows } = await pool.query(sql, params);
    res.json(rows);
  } catch (err) {
    console.error('Erreur filtrage modèles:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ---------- ENVOI ET RECUPERATION TICKETS ----------
app.post('/api/tickets', async (req, res) => {
  const { code_infrastructure, symptome, titre, description, description_symptomes, etat, technicien_assigne, priorite } = req.body;
  
  const ticketTitle = titre || symptome || 'Nouveau ticket';
  const ticketDescription = description || description_symptomes || symptome || '';

  if (!code_infrastructure) {
    return res.status(400).json({ success: false, message: "Le code de l'infrastructure est obligatoire." });
  }

  try {
    let finalCode = code_infrastructure.trim();

    const checkInfraSql = `
      SELECT code_unique 
      FROM infrastructures 
      WHERE TRIM(UPPER(code_unique)) = TRIM(UPPER($1))
         OR TRIM(UPPER(nom_equipement)) = TRIM(UPPER($1))
         OR TRIM(UPPER(nom_equipement)) LIKE TRIM(UPPER($1)) || '%'
         OR $1 LIKE '%' || TRIM(UPPER(code_unique)) || '%'
      LIMIT 1
    `;
    const infraCheck = await pool.query(checkInfraSql, [finalCode]);
    
    if (infraCheck.rows.length > 0) {
      finalCode = infraCheck.rows[0].code_unique;
    } else {
      const fallback = await pool.query("SELECT code_unique FROM infrastructures LIMIT 1");
      if (fallback.rows.length > 0) finalCode = fallback.rows[0].code_unique;
    }

    let cleanEtat = 'En attente'; 
    if (etat) {
      const e = etat.trim().toLowerCase();
      if (e.includes('attente') || e.includes('nouveau') || e === 'ouvert') cleanEtat = 'En attente';
      if (e.includes('cours')) cleanEtat = 'En cours';
      if (e.includes('assign')) cleanEtat = 'Assigné';
      if (e.includes('resolu') || e.includes('traite')) cleanEtat = 'Résolu';
    }

    const sqlInsert = `
      INSERT INTO tickets (code_infrastructure, titre, description_symptomes, etat, priorite, technicien_assigne, notification_annulee_vue) 
      VALUES ($1, $2, $3, $4, $5, $6, FALSE) RETURNING id
    `;
    const result = await pool.query(sqlInsert, [
      finalCode, 
      ticketTitle, 
      ticketDescription, 
      cleanEtat, 
      priorite || null, 
      technicien_assigne || null
    ]);
    
    res.json({ success: true, message: "Ticket créé et envoyé au Dashboard Opérateur !", id: result.rows[0].id });
  } catch (err) {
    console.error('Erreur critique création ticket (Code 500) :', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// Récupération globale des tickets avec filtres pour l'application Mobile et le Poller
app.get('/api/tickets', async (req, res) => {
  const { technicien } = req.query;
  try {
    let sql = `
      SELECT t.id, t.code_infrastructure, i.nom_equipement, i.localisation, t.titre, t.description_symptomes AS description, t.symptome, t.etat, t.priorite, t.priorite AS criticite, t.technicien_assigne, t.date_creation, t.notification_annulee_vue
      FROM tickets t
      LEFT JOIN infrastructures i ON t.code_infrastructure = i.code_unique
    `;
    const params = [];

    // RÈGLE : Si c'est l'espace Technicien, on applique le filtrage strict des tickets portant son nom exclusif
    if (technicien && technicien.trim() !== '') {
      sql += ` WHERE TRIM(UPPER(t.technicien_assigne)) = TRIM(UPPER($1)) AND t.etat != 'Annulé'`;
      params.push(technicien.trim());
    } else {
      sql += ` WHERE 1=1`;
    }

    sql += ` ORDER BY t.date_creation DESC`;
    
    const { rows } = await pool.query(sql, params);
    res.json(rows);
  } catch (err) {
    console.error('Erreur récupération des tickets:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// Fonctionnalité 2 : Mise à jour sécurisée, Assignation (Obligatoire) et boucle d'annulation
app.put('/api/tickets/:id', async (req, res) => {
  const id = req.params.id;
  const { etat, priorite, criticite, technicien_assigne, notification_vue } = req.body;
  
  const finalPriorite = priorite || criticite;

  try {
    // 1. Gestion de l'accusé de réception pour fermer l'alerte modale chez l'opérateur
    if (notification_vue === true) {
      await pool.query("UPDATE tickets SET notification_annulee_vue = TRUE WHERE id = $1", [id]);
      return res.json({ success: true, message: "Notification d'annulation marquée comme lue." });
    }

    // 2. Traitement d'annulation initié par un technicien
    if (etat && (etat.trim().toLowerCase() === 'annulé' || etat.trim().toLowerCase() === 'annule')) {
      const sqlCancel = `
        UPDATE tickets 
        SET etat = 'Annulé', 
            priorite = NULL,
            technicien_assigne = NULL,
            notification_annulee_vue = FALSE 
        WHERE id = $1
      `;
      await pool.query(sqlCancel, [id]);
      return res.json({ success: true, message: "Le ticket a été annulé par le technicien, renvoyé au Dashboard Opérateur pour réassignation." });
    }

    // 3. RÈGLE STRICTE OBLIGATOIRE POUR L'OPÉRATEUR : Si l'opérateur assigne à un technicien, la criticité doit être fournie.
    if (technicien_assigne && technicien_assigne.trim() !== '') {
      if (!finalPriorite || finalPriorite.trim() === '') {
        return res.status(400).json({ 
          success: false, 
          message: "Action Interdite : Vous devez impérativement spécifier la criticité du ticket avant de pouvoir l'assigner à un technicien." 
        });
      }
    }

    // 4. Traitement standard de mise à jour / réassignation (Le ticket portera le nom du nouveau technicien)
    let finalEtat = etat;
    if (technicien_assigne && (!etat || etat === 'En attente' || etat === 'Annulé')) {
      finalEtat = 'Assigné';
    }

    const sqlUpdate = `
      UPDATE tickets 
      SET etat = COALESCE($1, etat), 
          priorite = COALESCE($2, priorite),
          technicien_assigne = COALESCE($3, technicien_assigne)
      WHERE id = $4
    `;
    await pool.query(sqlUpdate, [finalEtat, finalPriorite, technicien_assigne, id]);
    res.json({ success: true, message: "Ticket mis à jour et transféré avec succès." });
  } catch (err) {
    console.error(`Erreur mise à jour ticket ID ${id}:`, err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ---------- INFRASTRUCTURES GENERAL CRUD ----------
app.get('/api/infrastructures', async (req, res) => {
  try {
    let sql = `
      SELECT 
        i.code_unique, 
        i.nom_equipement, 
        i.localisation, 
        i.type_id,
        e.modele, 
        e.numero_serie, 
        e.date_installation, 
        e.statut
      FROM infrastructures i
      LEFT JOIN equipements e ON TRIM(UPPER(i.code_unique)) = TRIM(UPPER(e.nom))
      ORDER BY i.code_unique ASC
    `;
    const { rows } = await pool.query(sql);
    res.json(rows);
  } catch (err) {
    console.error('/api/infrastructures GET error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/infrastructures', async (req, res) => {
  const client = await pool.connect();
  try {
    const { code_unique, nom_equipement, localisation, type_id, modele, numero_serie, date_installation, statut } = req.body;
    if (!code_unique || !nom_equipement || !localisation) {
      return res.status(400).json({ success: false, message: 'code_unique, nom_equipement et localisation sont requis.' });
    }

    const validatedStatut = formatStatut(statut);
    const textTypeName = await getTypeTextualName(type_id);

    await client.query('BEGIN');

    const parsedTypeId = hasTypeId && type_id && !isNaN(parseInt(type_id, 10)) ? parseInt(type_id, 10) : null;
    const sqlInsertInfra = "INSERT INTO infrastructures (code_unique, nom_equipement, localisation, type_id) VALUES ($1, $2, $3, $4)";
    await client.query(sqlInsertInfra, [code_unique, nom_equipement, localisation, parsedTypeId]);

    const sqlInsertEquip = `
      INSERT INTO equipements (nom, type_equipement, modele, numero_serie, lieu, date_installation, statut)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
    `;
    await client.query(sqlInsertEquip, [
      code_unique, 
      textTypeName, 
      modele || null, 
      numero_serie || null, 
      localisation, 
      date_installation || null, 
      validatedStatut
    ]);

    await client.query('COMMIT');
    res.json({ success: true, message: "Infrastructure et équipements ajoutés !", code_unique });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('/api/infrastructures POST error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  } finally {
    client.release();
  }
});

app.put('/api/infrastructures/:code_unique', async (req, res) => {
  const codeUnique = req.params.code_unique;
  const client = await pool.connect();
  try {
    const { nom_equipement, localisation, type_id, modele, numero_serie, date_installation, statut } = req.body;
    if (!nom_equipement || !localisation) {
      return res.status(400).json({ success: false, message: 'Le nom et la localisation sont requis.' });
    }

    const validatedStatut = formatStatut(statut);
    const textTypeName = await getTypeTextualName(type_id);

    await client.query('BEGIN');

    const parsedTypeId = hasTypeId && type_id && !isNaN(parseInt(type_id, 10)) ? parseInt(type_id, 10) : null;
    const sqlUpdateInfra = `
      UPDATE infrastructures 
      SET nom_equipement = $1, localisation = $2, type_id = $3 
      WHERE code_unique = $4
    `;
    await client.query(sqlUpdateInfra, [nom_equipement, localisation, parsedTypeId, codeUnique]);

    const sqlCheckEquip = "SELECT 1 FROM equipements WHERE TRIM(UPPER(nom)) = TRIM(UPPER($1))";
    const checkRes = await client.query(sqlCheckEquip, [codeUnique]);

    if (checkRes.rows.length > 0) {
      const sqlUpdateEquip = `
        UPDATE equipements 
        SET type_equipement = $1, modele = $2, numero_serie = $3, lieu = $4, date_installation = $5, statut = $6
        WHERE TRIM(UPPER(nom)) = TRIM(UPPER($7))
      `;
      await client.query(sqlUpdateEquip, [textTypeName, modele || null, numero_serie || null, localisation, date_installation || null, validatedStatut, codeUnique]);
    } else {
      const sqlInsertEquip = `
        INSERT INTO equipements (nom, type_equipement, modele, numero_serie, lieu, date_installation, statut)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
      `;
      await client.query(sqlInsertEquip, [codeUnique, textTypeName, modele || null, numero_serie || null, localisation, date_installation || null, validatedStatut]);
    }

    await client.query('COMMIT');
    res.json({ success: true, message: "Infrastructure mise à jour avec succès !" });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Erreur modification infrastructure / PUT:', err.message);
    res.status(500).json({ success: false, error: err.message });
  } finally {
    client.release();
  }
});

app.delete('/api/infrastructures/:code_unique', async (req, res) => {
  const codeUnique = req.params.code_unique;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query("DELETE FROM equipements WHERE TRIM(UPPER(nom)) = TRIM(UPPER($1))", [codeUnique]);
    await client.query("DELETE FROM infrastructures WHERE code_unique = $1", [codeUnique]);
    await client.query('COMMIT');
    res.json({ success: true, message: "Infrastructure supprimée avec succès." });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Erreur suppression infrastructure:', err.message);
    res.status(500).json({ success: false, error: err.message });
  } finally {
    client.release();
  }
});

// ---------- WEB PAGES ROUTING ----------
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'views', 'login.html')));
app.get('/login', (req, res) => res.sendFile(path.join(__dirname, 'views', 'login.html')));
app.get('/dashboard-operateur', (req, res) => res.sendFile(path.join(__dirname, 'views', 'dashboard-operateur.html')));
app.get('/dashboard-administrateur', (req, res) => res.sendFile(path.join(__dirname, 'views', 'dashboard-administrateur.html')));
app.get('/dashboard-technicien', (req, res) => res.sendFile(path.join(__dirname, 'views', 'dashboard-technicien.html')));

// ---------- RUN SERVER ----------
app.listen(PORT, () => {
  console.log(`🚀 SERVEUR SYNC AFM OPÉRATIONNEL : http://localhost:${PORT}`);
});
