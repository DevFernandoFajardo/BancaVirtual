import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Pool, types } from 'pg';

/** Algo que puede ejecutar consultas: el pool, o una transacción en curso. */
export interface Queryable {
  query<T = any>(text: string, params?: unknown[]): Promise<{ rows: T[]; rowCount: number }>;
}

@Injectable()
export class DatabaseService implements Queryable, OnModuleDestroy {
  private readonly logger = new Logger(DatabaseService.name);
  private readonly pool: Pool;

  constructor(config: ConfigService) {
    // DATE (oid 1082) como texto 'YYYY-MM-DD' para evitar desfases de zona horaria
    types.setTypeParser(1082, (v) => v);

    this.pool = new Pool({
      host: config.get<string>('DB_HOST', 'localhost'),
      port: Number(config.get('DB_PORT', 5432)),
      user: config.get<string>('DB_USER', 'postgres'),
      password: config.getOrThrow<string>('DB_PASSWORD'),
      database: config.get<string>('DB_NAME', 'banca_virtual'),
      max: 10,
    });
    this.pool.on('error', (err) => this.logger.error(`Error en el pool de PostgreSQL: ${err.message}`));
  }

  async query<T = any>(text: string, params: unknown[] = []) {
    const r = await this.pool.query(text, params as any[]);
    return { rows: r.rows as T[], rowCount: r.rowCount ?? 0 };
  }

  /** Primera fila o null */
  async one<T = any>(text: string, params: unknown[] = [], q: Queryable = this): Promise<T | null> {
    const r = await q.query<T>(text, params);
    return r.rows[0] ?? null;
  }

  async rows<T = any>(text: string, params: unknown[] = [], q: Queryable = this): Promise<T[]> {
    return (await q.query<T>(text, params)).rows;
  }

  /** Ejecuta `fn` dentro de BEGIN/COMMIT; ante cualquier error hace ROLLBACK. */
  async transaction<T>(fn: (tx: Queryable) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    const tx: Queryable = {
      query: async (text, params = []) => {
        const r = await client.query(text, params as any[]);
        return { rows: r.rows, rowCount: r.rowCount ?? 0 };
      },
    };
    try {
      await client.query('BEGIN');
      const result = await fn(tx);
      await client.query('COMMIT');
      return result;
    } catch (err) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw err;
    } finally {
      client.release();
    }
  }

  async onModuleDestroy() {
    await this.pool.end();
  }
}

/** Código de error de PostgreSQL para violación de unicidad */
export const PG_UNIQUE_VIOLATION = '23505';
