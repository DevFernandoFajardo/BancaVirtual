import { Module } from '@nestjs/common';
import { SeguridadController } from './seguridad.controller';
import { SeguridadService } from './seguridad.service';

@Module({ controllers: [SeguridadController], providers: [SeguridadService] })
export class SeguridadModule {}
