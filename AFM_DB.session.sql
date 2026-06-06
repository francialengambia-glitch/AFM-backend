-- =========================================================================
-- SCRIPT DE CRÉATION DE LA BASE DE DONNÉES POSTGRESQL : ASSET FIX MANAGER
-- =========================================================================

-- 1. Nettoyage des anciennes tables si elles existent (pour éviter les conflits de réécriture)
DROP TABLE IF EXISTS tickets CASCADE;
DROP TABLE IF EXISTS utilisateurs CASCADE;
DROP TABLE IF EXISTS infrastructures CASCADE;

-- 2. Création de la table des Utilisateurs (Comptes @gmail.com avec contrôle de rôle)
CREATE TABLE utilisateurs (
    id SERIAL PRIMARY KEY,
    email VARCHAR(150) UNIQUE NOT NULL,
    mot_de_passe VARCHAR(100) NOT NULL,
    role VARCHAR(50) NOT NULL CHECK (role IN ('Administrateur', 'Opérateur', 'Technicien', 'Employé'))
);

-- 3. Création de la table du Parc Infrastructurel (Équipements)
CREATE TABLE infrastructures (
    code_unique VARCHAR(50) PRIMARY KEY,
    nom_equipement VARCHAR(150) NOT NULL,
    localisation VARCHAR(150) NOT NULL
);

-- 4. Création de la table des Tickets d'Intervention
CREATE TABLE tickets (
    id SERIAL PRIMARY KEY,
    numero_ticket VARCHAR(20) UNIQUE NOT NULL,
    titre VARCHAR(150) NOT NULL,
    description_symptomes TEXT NOT NULL,
    code_infrastructure VARCHAR(50) REFERENCES infrastructures(code_unique) ON DELETE SET NULL,
    priorite VARCHAR(20) NOT NULL CHECK (priorite IN ('HAUTE', 'MOYENNE', 'FAIBLE', 'BASSE')),
    etat VARCHAR(50) NOT NULL CHECK (etat IN ('Nouveau', 'En cours', 'Terminé', 'Annulé')),
    diagnostic_logic TEXT,
    date_creation TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    date_resolution TIMESTAMP
);

-- =========================================================================
-- INSERTS INITIALES DE SIMULATION EN BASE DE DONNÉES
-- =========================================================================

-- Données pour la table des utilisateurs
INSERT INTO utilisateurs (email, mot_de_passe, role) VALUES
('admin@gmail.com', 'admin123', 'Administrateur'),
('cindy.binome@gmail.com', 'operator123', 'Opérateur'),
('paul.mendes@gmail.com', 'tech123', 'Technicien'),
('jean.employe@gmail.com', 'user123', 'Employé');

-- Données pour la table des infrastructures
INSERT INTO infrastructures (code_unique, nom_equipement, localisation) VALUES
('INF-001', 'Climatiseur Split Central', 'Salle B2 (Bloc Nord)'),
('INF-002', 'Groupe Électrogène 400kVA', 'Zone Sud (Atelier)'),
('INF-003', 'Backbone Commutateur Réseau', 'Salle des Serveurs'),
('INF-014', 'Compresseur d''air d''atelier', 'Atelier Principal (Zone Sud)');

-- Données pour la table des tickets
INSERT INTO tickets (numero_ticket, titre, description_symptomes, code_infrastructure, priorite, etat, diagnostic_logic, date_creation, date_resolution) VALUES
('TK-942', 'Panne Système de Climatisation Central', 'L''appareil ne produit plus aucun flux froid et émet un fort cliquetis mécanique au démarrage.', 'INF-001', 'HAUTE', 'Terminé', 'Remplacement roulements turbine + Recharge fluide', '2026-05-18 08:32:00', '2026-05-18 09:14:00'),
('TK-943', 'Baisse de pression et fuite d''huile', 'Perte de charge constatée sur le manomètre secondaire avec dépôt visqueux au sol.', 'INF-014', 'MOYENNE', 'En cours', NULL, '2026-05-18 09:15:00', NULL),
('TK-944', 'Défaut d''isolement sur armoire électrique', 'Disjonctions intempestives de la ligne de puissance principale sans surcharge apparente.', 'INF-002', 'HAUTE', 'Nouveau', NULL, '2026-05-18 10:02:00', NULL),
('TK-945', 'Coupure d''alimentation Backbone', 'Perte totale de liaison réseau sur le commutateur de distribution de l''étage.', 'INF-003', 'BASSE', 'Nouveau', NULL, '2026-05-18 11:20:00', NULL);
