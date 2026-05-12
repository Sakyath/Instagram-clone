declare module 'better-sqlite3' {
  interface Database {
    exec(sql: string): void;
    prepare(sql: string): Statement;
    pragma(pragma: string): any;
    close(): void;
  }

  interface Statement {
    run(...params: any[]): { lastInsertRowid: number; changes: number };
    get(...params: any[]): any;
    all(...params: any[]): any[];
  }

  interface DatabaseConstructor {
    new (path: string, options?: { verbose?: (message: string) => void }): Database;
    (path: string, options?: { verbose?: (message: string) => void }): Database;
  }

  const Database: DatabaseConstructor;
  export = Database;
}
