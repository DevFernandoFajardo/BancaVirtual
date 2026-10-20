import { Global, Module } from '@nestjs/common';
import { CpClient } from './cp.client';
import { CpGestionesService } from './cp-gestiones.service';

@Global()
@Module({ providers: [CpClient, CpGestionesService], exports: [CpClient, CpGestionesService] })
export class CpModule {}
