import { Global, Module } from '@nestjs/common';
import { CpClient } from './cp.client';
import { CpAuthService } from './cp-auth.service';
import { CpGestionesService } from './cp-gestiones.service';

@Global()
@Module({ providers: [CpClient, CpAuthService, CpGestionesService], exports: [CpClient, CpAuthService, CpGestionesService] })
export class CpModule {}
