import { Controller, Get } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { AppService } from './app.service';

@ApiExcludeController()
@Controller('health')
export class AppController {
  constructor(private readonly app: AppService) {}

  @Get()
  health() {
    return this.app.health();
  }
}
