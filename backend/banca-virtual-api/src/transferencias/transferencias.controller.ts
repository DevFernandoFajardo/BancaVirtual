import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { AuthUser } from '../auth/auth.schema';
import { Auth, CurrentUser } from '../auth/jwt-auth.guard';
import { PaginacionDto } from '../common/pagination.schema';
import { PendientesCelularService } from './pendientes-celular.service';
import { CrearTransferenciaCelularDto, CrearTransferenciaDto } from './transferencias.schema';
import { TransferenciasService } from './transferencias.service';

@ApiTags('Transferencias')
@Controller('transferencias')
@Auth('CLIENTE')
export class TransferenciasController {
  constructor(
    private readonly transferencias: TransferenciasService,
    private readonly pendientes: PendientesCelularService,
  ) {}

  @Post()
  crear(@CurrentUser() user: AuthUser, @Body() dto: CrearTransferenciaDto) {
    return this.transferencias.transferir(user.sub, dto);
  }

  /** Transferencia móvil: a un celular registrado o, si aún no existe, queda pendiente de reclamar. */
  @Post('celular')
  celular(@CurrentUser() user: AuthUser, @Body() dto: CrearTransferenciaCelularDto) {
    return this.pendientes.enviar(user.sub, dto);
  }

  @Get('celular/pendientes')
  pendientesCelular(@CurrentUser() user: AuthUser) {
    return this.pendientes.listar(user.sub);
  }

  @Post('celular/pendientes/:id/cancelar')
  cancelarPendiente(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.pendientes.cancelar(user.sub, id);
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
