import { Module } from '@nestjs/common';
import { CuentasModule } from '../cuentas/cuentas.module';
import { BeneficiariosController } from './beneficiarios.controller';
import { BeneficiariosService } from './beneficiarios.service';

@Module({
  imports: [CuentasModule],
  controllers: [BeneficiariosController],
  providers: [BeneficiariosService],
})
export class BeneficiariosModule {}
