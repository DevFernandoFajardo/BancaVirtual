import { Injectable } from '@nestjs/common';
import { DatabaseService } from './database/database.service';

@Injectable()
export class AppService {
  constructor(private readonly db: DatabaseService) {}

  async health() {
    await this.db.query('SELECT 1');
    return { status: 'ok', database: 'ok' };
  }
}
