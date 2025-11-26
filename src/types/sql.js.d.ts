declare module 'sql.js' {
  export interface Database {
    run(sql: string, params?: any[]): any;
    exec(sql: string, params?: any[]): any;
  }
}
