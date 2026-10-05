import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { AuthUser } from '../auth/auth.schema';
import { Auth, CurrentUser } from '../auth/jwt-auth.guard';
import { CrearBeneficiarioDto } from './beneficiarios.schema';
import { BeneficiariosService } from './beneficiarios.service';

@ApiTags('Beneficiarios')
@Controller('beneficiarios')
@Auth('CLIENTE')
export class BeneficiariosController {
  constructor(private readonly beneficiarios: BeneficiariosService) {}

  @Get()
  listar(@CurrentUser() user: AuthUser) {
    return this.beneficiarios.listar(user.sub);
  }

  @Post()
  crear(@CurrentUser() user: AuthUser, @Body() dto: CrearBeneficiarioDto) {
    return this.beneficiarios.crear(user.sub, dto);
  }

  @Delete(':id')
  eliminar(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.beneficiarios.eliminar(user.sub, id);
  }
}
