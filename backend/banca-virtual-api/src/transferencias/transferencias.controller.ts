import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { AuthUser } from '../auth/auth.schema';
import { Auth, CurrentUser } from '../auth/jwt-auth.guard';
import { PaginacionDto } from '../common/pagination.schema';
import { CrearTransferenciaDto } from './transferencias.schema';
import { TransferenciasService } from './transferencias.service';

@ApiTags('Transferencias')
@Controller('transferencias')
@Auth('CLIENTE')
export class TransferenciasController {
  constructor(private readonly transferencias: TransferenciasService) {}

  @Post()
  crear(@CurrentUser() user: AuthUser, @Body() dto: CrearTransferenciaDto) {
    return this.transferencias.transferir(user.sub, dto);
  }

  @Get('comprobante/:referencia')
  comprobante(@CurrentUser() user: AuthUser, @Param('referencia') referencia: string) {
    return this.transferencias.comprobante(user.sub, referencia);
  }

  @Get()
  listar(@CurrentUser() user: AuthUser, @Query() q: PaginacionDto) {
    return this.transferencias.listar(user.sub, q.page, q.limit);
  }
}
