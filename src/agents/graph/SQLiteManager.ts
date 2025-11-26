import initSqlJs, { Database } from 'sql.js';
import { IMemoryTransaction } from './types';
import { MIGRATIONS, getCurrentVersion, setVersion } from './migrations';
import { createLogger } from '../../lib/logger';

const log = createLogger('SQLiteManager');

const SQL_WASM_URL = '/sql-wasm.wasm';
const BACKUP_DB_NAME = 'KenshoBackups';
const BACKUP_STORE_NAME = 'backups';

/**
 * Gère la base de données SQLite avec persistance sur IndexedDB.
 * Assure la robustesse atomique via un journal de transactions.
 */
export class SQLiteManager {
  private db: Database | null = null;
  private isInitialized = false;
  private isDirty = false;
  private initPromise: Promise<void> | null = null;
  private checkpointInterval: number | null = null;
  private readonly dbName: string;
  private readonly storeName: string;

  constructor(dbName = 'KenshoDB', storeName = 'files') {
    this.dbName = dbName;
    this.storeName = storeName;
    this.initPromise = this.initialize();
    
    this.checkpointInterval = window.setInterval(() => {
      this.checkpoint().catch(err => {
        log.error('Échec du checkpoint automatique:', err as Error);
      });
    }, 30000);
  }

  private async initialize(): Promise<void> {
    if (this.isInitialized) return;

    try {
      log.info('Initialisation...');
      const SQL = await initSqlJs({ locateFile: () => SQL_WASM_URL });
      const storedDb = await this.loadFromIndexedDB();

      if (storedDb) {
        log.info('Chargement de la base de données existante...');
        this.db = new SQL.Database(storedDb);
        log.info('Base de données chargée depuis IndexedDB');
      } else {
        log.info('Création d\'une nouvelle base de données...');
        this.db = new SQL.Database();
      }

      await this.runMigrations();

      this.isInitialized = true;
      log.info('Prêt');
    } catch (error) {
      log.error('Échec critique de l\'initialisation:', error as Error);
      throw error;
    }
  }

  /**
   * Exécute les migrations de schéma avec backup automatique et rollback en cas d'échec.
   * Cette méthode implémente la philosophie "Les données de l'utilisateur sont sacrées".
   */
  private async runMigrations(): Promise<void> {
    if (!this.db) {
      throw new Error('[SQLiteManager] Base de données non initialisée');
    }

    const currentVersion = getCurrentVersion(this.db);
    const targetVersion = MIGRATIONS[MIGRATIONS.length - 1].version;

    log.info(`Version actuelle: ${currentVersion}, Version cible: ${targetVersion}`);

    if (currentVersion >= targetVersion) {
      log.info('Schéma à jour, pas de migration nécessaire');
      await this.ensureGeneralProjectExists();
      return;
    }

    const pendingMigrations = MIGRATIONS.filter(m => m.version > currentVersion);
    log.info(`${pendingMigrations.length} migration(s) en attente`);

    const backupData = this.db.export();
    await this.createBackup(`pre-migration-v${currentVersion}`, backupData);

    for (const migration of pendingMigrations) {
      try {
        log.info(`Application de la migration vers v${migration.version}...`);
        migration.up(this.db);
        setVersion(this.db, migration.version);
        log.info(`Migration v${migration.version} réussie`);
      } catch (error) {
        log.error(`ÉCHEC de la migration v${migration.version}!`, error as Error);
        log.info('Tentative de restauration depuis le backup...');
        
        const SQL = await initSqlJs({ locateFile: () => SQL_WASM_URL });
        this.db.close();
        this.db = new SQL.Database(backupData);
        
        const errorMessage = `La mise à jour de la base de données a échoué. Votre session a été restaurée. Veuillez contacter le support.`;
        log.error('Migration échouée', new Error(errorMessage));
        
        throw new Error(`Migration v${migration.version} a échoué et a été annulée.`);
      }
    }

    await this.ensureGeneralProjectExists();
    await this.checkpoint(true);
  }

  /**
   * Crée un backup de la base de données dans IndexedDB.
   * Les backups sont stockés séparément pour permettre la récupération en cas d'échec.
   */
  private async createBackup(name: string, data: Uint8Array): Promise<void> {
    return new Promise((resolve, reject) => {
      log.debug(`Création du backup: ${name}...`);
      const request = indexedDB.open(BACKUP_DB_NAME, 1);

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        if (!db.objectStoreNames.contains(BACKUP_STORE_NAME)) {
          db.createObjectStore(BACKUP_STORE_NAME);
        }
      };

      request.onsuccess = () => {
        const db = request.result;
        const tx = db.transaction(BACKUP_STORE_NAME, 'readwrite');
        const store = tx.objectStore(BACKUP_STORE_NAME);
        store.put(data, name);

        tx.oncomplete = () => {
          db.close();
          log.debug(`Backup ${name} créé avec succès`);
          resolve();
        };

        tx.onerror = () => {
          db.close();
          log.error('Erreur lors de la création du backup:', tx.error as Error);
          reject(tx.error);
        };
      };

      request.onerror = () => {
        log.error('Erreur lors de l\'ouverture de la base de backups:', request.error as Error);
        reject(request.error);
      };
    });
  }

  /**
   * Garantit qu'un projet "Général" existe par défaut.
   * Ce projet sert de point de départ pour les nouveaux utilisateurs.
   */
  private async ensureGeneralProjectExists(): Promise<void> {
    if (!this.db) return;

    try {
      const result = this.db.exec(`SELECT id FROM projects WHERE name = 'Général' LIMIT 1`);
      
      if (!result[0] || result[0].values.length === 0) {
        log.info('Création du projet "Général" par défaut...');
        const now = Date.now();
        const id = `proj-${Date.now()}-${Math.random().toString(36).substring(7)}`;
        
        this.db.run(`
          INSERT INTO projects (id, name, goal, createdAt, lastActivityAt, isArchived) 
          VALUES (?, ?, ?, ?, ?, 0)
        `, [id, 'Général', 'Un espace pour toutes vos conversations générales.', now, now]);
        
        this.markAsDirty();
        log.info('Projet "Général" créé');
      }
    } catch (error) {
      log.warn('Impossible de créer le projet par défaut:', error as Error);
    }
  }

  public async getDb(): Promise<Database> {
    if (!this.initPromise) {
      throw new Error('[SQLiteManager] Non initialisé.');
    }
    await this.initPromise;
    if (!this.db) {
      throw new Error('[SQLiteManager] La base de données n\'a pas pu être chargée.');
    }
    return this.db;
  }

  public markAsDirty(): void {
    this.isDirty = true;
  }

  public async checkpoint(force = false): Promise<void> {
    if ((!this.isDirty && !force) || !this.db) {
      return;
    }

    log.debug('Checkpoint vers IndexedDB...');
    try {
      const data = this.db.export();
      await this.saveToIndexedDB(data);
      this.isDirty = false;
      log.debug('Checkpoint réussi');
    } catch (error) {
      log.error('Échec du checkpoint:', error as Error);
      throw error;
    }
  }

  public async getStats(): Promise<{
    nodeCount: number;
    edgeCount: number;
    pendingTransactions: number;
  }> {
    const db = await this.getDb();
    
    const nodeResult = db.exec('SELECT COUNT(*) FROM nodes');
    const edgeResult = db.exec('SELECT COUNT(*) FROM edges');
    const txResult = db.exec('SELECT COUNT(*) FROM transactions WHERE status = "PENDING"');
    
    return {
      nodeCount: nodeResult[0]?.values[0][0] as number || 0,
      edgeCount: edgeResult[0]?.values[0][0] as number || 0,
      pendingTransactions: txResult[0]?.values[0][0] as number || 0,
    };
  }

  private async saveToIndexedDB(data: Uint8Array): Promise<void> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName, 1);
      
      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        if (!db.objectStoreNames.contains(this.storeName)) {
          db.createObjectStore(this.storeName);
        }
      };
      
      request.onsuccess = () => {
        const db = request.result;
        const tx = db.transaction(this.storeName, 'readwrite');
        const store = tx.objectStore(this.storeName);
        store.put(data, 'graph.sqlite');
        
        tx.oncomplete = () => {
          db.close();
          resolve();
        };
        
        tx.onerror = () => {
          db.close();
          reject(tx.error);
        };
      };
      
      request.onerror = () => reject(request.error);
    });
  }

  private async loadFromIndexedDB(): Promise<Uint8Array | null> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName, 1);
      
      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        if (!db.objectStoreNames.contains(this.storeName)) {
          db.createObjectStore(this.storeName);
        }
      };
      
      request.onsuccess = () => {
        const db = request.result;
        const tx = db.transaction(this.storeName, 'readonly');
        const store = tx.objectStore(this.storeName);
        const getReq = store.get('graph.sqlite');
        
        getReq.onsuccess = () => {
          db.close();
          resolve(getReq.result || null);
        };
        
        getReq.onerror = () => {
          db.close();
          reject(getReq.error);
        };
      };
      
      request.onerror = () => reject(request.error);
    });
  }

  public async cleanup(): Promise<void> {
    if (this.checkpointInterval !== null) {
      window.clearInterval(this.checkpointInterval);
      this.checkpointInterval = null;
    }
    
    await this.checkpoint(true);
    
    if (this.db) {
      this.db.close();
      this.db = null;
    }
    
    this.isInitialized = false;
    log.info('Nettoyage terminé');
  }
}
