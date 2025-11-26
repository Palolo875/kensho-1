import type { Database } from 'sql.js';

/**
 * Interface définissant une migration de schéma de base de données.
 * Chaque migration a un numéro de version et une fonction `up` pour l'appliquer.
 * La fonction `down` est optionnelle et utilisée pour les tests/rollbacks.
 */
export interface Migration {
  version: number;
  up: (db: Database) => void;
  down?: (db: Database) => void;
}

/**
 * Liste ordonnée des migrations du schéma Kensho.
 * Chaque migration doit incrémenter la version de 1.
 * 
 * RÈGLE CRITIQUE: Ne jamais modifier une migration existante une fois déployée.
 * Pour changer le schéma, créer une nouvelle migration.
 */
export const MIGRATIONS: Migration[] = [
  /**
   * Migration 1: Schéma initial du Knowledge Graph
   * Créé durant les Sprints 1-5
   */
  {
    version: 1,
    up: (db: Database) => {
      db.run(`PRAGMA journal_mode = WAL`);
      db.run(`PRAGMA foreign_keys = ON`);

      // Table des transactions pour la robustesse atomique
      db.run(`
        CREATE TABLE IF NOT EXISTS transactions (
          id TEXT PRIMARY KEY,
          node_id TEXT,
          operation TEXT NOT NULL,
          status TEXT NOT NULL,
          timestamp INTEGER NOT NULL,
          error TEXT
        )
      `);

      // Table de provenance pour la traçabilité
      db.run(`
        CREATE TABLE IF NOT EXISTS provenance (
          id TEXT PRIMARY KEY,
          source_type TEXT NOT NULL,
          source_id TEXT,
          timestamp INTEGER NOT NULL,
          metadata TEXT
        )
      `);

      // Table des nœuds (unités de mémoire)
      db.run(`
        CREATE TABLE IF NOT EXISTS nodes (
          id TEXT PRIMARY KEY,
          content TEXT NOT NULL,
          type TEXT NOT NULL,
          provenance_id TEXT NOT NULL,
          version INTEGER NOT NULL DEFAULT 1,
          replaces_node_id TEXT,
          importance REAL NOT NULL DEFAULT 1.0,
          created_at INTEGER NOT NULL,
          last_accessed_at INTEGER NOT NULL,
          embedding TEXT,
          FOREIGN KEY (provenance_id) REFERENCES provenance (id)
        )
      `);

      // Table des arêtes (relations entre nœuds)
      db.run(`
        CREATE TABLE IF NOT EXISTS edges (
          id TEXT PRIMARY KEY,
          source_node_id TEXT NOT NULL,
          target_node_id TEXT NOT NULL,
          label TEXT NOT NULL,
          weight REAL NOT NULL DEFAULT 1.0,
          FOREIGN KEY (source_node_id) REFERENCES nodes (id) ON DELETE CASCADE,
          FOREIGN KEY (target_node_id) REFERENCES nodes (id) ON DELETE CASCADE
        )
      `);

      // Index pour performance
      db.run(`CREATE INDEX IF NOT EXISTS idx_nodes_type ON nodes (type)`);
      db.run(`CREATE INDEX IF NOT EXISTS idx_nodes_created_at ON nodes (created_at)`);
      db.run(`CREATE INDEX IF NOT EXISTS idx_nodes_provenance ON nodes (provenance_id)`);
      db.run(`CREATE INDEX IF NOT EXISTS idx_transactions_status ON transactions (status)`);
      db.run(`CREATE INDEX IF NOT EXISTS idx_edges_source ON edges (source_node_id)`);
      db.run(`CREATE INDEX IF NOT EXISTS idx_edges_target ON edges (target_node_id)`);

      console.log('[Migration v1] Schéma initial du Knowledge Graph créé');
    }
  },

  /**
   * Migration 2: Système de Projets et Tâches (Sprint 7)
   * Ajoute la gestion de projets pour organiser les conversations et tâches
   */
  {
    version: 2,
    up: (db: Database) => {
      // Table des projets
      db.run(`
        CREATE TABLE IF NOT EXISTS projects (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          goal TEXT,
          isArchived INTEGER DEFAULT 0,
          createdAt INTEGER NOT NULL,
          lastActivityAt INTEGER NOT NULL
        )
      `);

      // Table des tâches de projet
      db.run(`
        CREATE TABLE IF NOT EXISTS project_tasks (
          id TEXT PRIMARY KEY,
          projectId TEXT NOT NULL,
          text TEXT NOT NULL,
          completed INTEGER DEFAULT 0,
          createdAt INTEGER NOT NULL,
          FOREIGN KEY (projectId) REFERENCES projects(id) ON DELETE CASCADE
        )
      `);

      // Vérifier si la colonne projectId existe déjà dans nodes
      const tableInfo = db.exec("PRAGMA table_info(nodes)");
      const hasProjectId = tableInfo[0]?.values.some(
        (row: any) => row[1] === 'projectId'
      );

      if (!hasProjectId) {
        // Ajouter projectId aux nodes pour lier conversations et projets
        db.run(`ALTER TABLE nodes ADD COLUMN projectId TEXT`);
      }

      // Index pour performance de filtrage par projet
      db.run(`CREATE INDEX IF NOT EXISTS idx_nodes_projectId ON nodes(projectId)`);
      db.run(`CREATE INDEX IF NOT EXISTS idx_projects_lastActivity ON projects(lastActivityAt)`);
      db.run(`CREATE INDEX IF NOT EXISTS idx_tasks_projectId ON project_tasks(projectId)`);

      console.log('[Migration v2] Système de projets et tâches créé');
    },
    
    down: (db: Database) => {
      // Rollback pour tests uniquement
      db.run(`DROP INDEX IF EXISTS idx_tasks_projectId`);
      db.run(`DROP INDEX IF EXISTS idx_projects_lastActivity`);
      db.run(`DROP INDEX IF EXISTS idx_nodes_projectId`);
      db.run(`DROP TABLE IF EXISTS project_tasks`);
      db.run(`DROP TABLE IF EXISTS projects`);
      console.log('[Migration v2] Rollback effectué');
    }
  }
];

/**
 * Obtient la version actuelle du schéma de base de données
 */
export function getCurrentVersion(db: Database): number {
  const result = db.exec('PRAGMA user_version');
  return result[0]?.values[0]?.[0] as number || 0;
}

/**
 * Définit la version du schéma de base de données
 */
export function setVersion(db: Database, version: number): void {
  db.run(`PRAGMA user_version = ${version}`);
}
