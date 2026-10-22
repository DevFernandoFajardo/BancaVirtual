import { Module } from '@nestjs/common';
import { ServiciosController } from './servicios.controller';
import { ProveedorServiciosClient } from './proveedor-servicios.client';
import { ServiciosService } from './servicios.service';

@Module({ controllers: [ServiciosController], providers: [ServiciosService, ProveedorServiciosClient] })
export class ServiciosModule {}
