import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { AuthUser } from '../auth/auth.schema';
import { Auth, CurrentUser } from '../auth/jwt-auth.guard';
import { ConsumoDemoDto, PagarTarjetaDto } from './tarjetas.schema';
import { TarjetasService } from './tarjetas.service';

@ApiTags('Tarjetas')
@Controller('tarjetas')
@Auth('CLIENTE')
export class TarjetasController {
  constructor(private readonly tarjetas: TarjetasService) {}

  @Get()
  listar(@CurrentUser() user: AuthUser) {
    return this.tarjetas.listar(user.sub);
  }

  @Get(':id')
  detalle(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.tarjetas.detalle(user.sub, id);
  }

  @Post(':id/bloquear')
  @HttpCode(200)
  bloquear(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.tarjetas.bloquear(user.sub, id, true);
  }

  @Post(':id/desbloquear')
  @HttpCode(200)
  desbloquear(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.tarjetas.bloquear(user.sub, id, false);
  }

  @Post(':id/pagar')
  pagar(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: PagarTarjetaDto) {
    return this.tarjetas.pagar(user.sub, id, dto.cuentaId, dto.monto);
  }

  @Post(':id/consumo-demo')
  consumoDemo(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: ConsumoDemoDto) {
    return this.tarjetas.consumoDemo(user.sub, id, dto.monto, dto.comercio);
  }
}
