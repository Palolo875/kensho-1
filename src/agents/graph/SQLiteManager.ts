import initSqlJs, { Database } from 'sql.js';
import { IMemoryTransaction } from './types';

const SQL_WASM_URL = '/sql-wasm.wasm';

const DB_SCHEMA = `
  PRAGMA journal_mode = WAL;
  PRAGMA foreign_keys = ON;
  PRAGMA user_version = 1;

  CREATE TABLE IF NOT EXISTS transactions (
    id TEXT PRIMARY KEY,
    node_id TEXT,
    operation TEXT NOT NULL,
    status TEXT NOT NULL,
    timestamp INTEGER NOT NULL,
    error TEXT
  );

  CREATE TABLE IF NOT EXISTS provenance (
    id TEXT PRIMARY KEY,
    source_type TEXT NOT NULL,
    source_id TEXT,
    timestamp INTEGER NOT NULL,
    metadata TEXT
  );

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
  );

  CREATE TABLE IF NOT EXISTS edges (
    id TEXT PRIMARY KEY,
    source_node_id TEXT NOT NULL,
    target_node_id TEXT NOT NULL,
    label TEXT NOT NULL,
    weight REAL NOT NULL DEFAULT 1.0,
    FOREIGN KEY (source_node_id) REFERENCES nodes (id) ON DELETE CASCADE,
    FOREIGN KEY (target_node_id) REFERENCES nodes (id) ON DELETE CASCADE
  );

  CREATE INDEX IF NOT EXISTS idx_nodes_type ON nodes (type);
  CREATE INDEX IF NOT EXISTS idx_nodes_created_at ON nodes (created_at);
  CREATE INDEX IF NOT EXISTS idx_nodes_provenance ON nodes (provenance_id);
  CREATE INDEX IF NOT EXISTS idx_transactions_status ON transactions (status);
  CREATE INDEX IF NOT EXISTS idx_edges_source ON edges (source_node_id);
  CREATE INDEX IF NOT EXISTS idx_edges_target ON edges (target_node_id);
`;

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
        console.error('[SQLiteManager] Échec du checkpoint automatique:', err);
      });
    }, 30000);
  }

  private async initialize(): Promise<void> {
    if (this.isInitialized) return;

    try {
      console.log('[SQLiteManager] Initialisation...');
      const SQL = await initSqlJs({ locateFile: () => SQL_WASM_URL });
      const storedDb = await this.loadFromIndexedDB();

      if (storedDb) {
        console.log('[SQLiteManager] Chargement de la base de données existante...');
        this.db = new SQL.Database(storedDb);
        console.log('[SQLiteManager] Base de données chargée depuis IndexedDB.');
      } else {
        console.log('[SQLiteManager] Création d\'une nouvelle base de données...');
        this.db = new SQL.Database();
        this.db.exec(DB_SCHEMA);
        await this.checkpoint(true);
        console.log('[SQLiteManager] Nouvelle base de données créée et sauvegardée.');
      }

      this.isInitialized = true;
      console.log('[SQLiteManager] ✅ Prêt.');
    } catch (error) {
      console.error('[SQLiteManager] ❌ Échec critique de l\'initialisation:', error);
      throw error;
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

    console.log('[SQLiteManager] Checkpoint vers IndexedDB...');
    try {
      const data = this.db.export();
      await this.saveToIndexedDB(data);
      this.isDirty = false;
      console.log('[SQLiteManager] ✅ Checkpoint réussi.');
    } catch (error) {
      console.error('[SQLiteManager] ❌ Échec du checkpoint:', error);
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
    console.log('[SQLiteManager] Nettoyage terminé.');
  }
}
