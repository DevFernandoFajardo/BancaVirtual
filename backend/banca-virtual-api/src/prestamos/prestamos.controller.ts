import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { AuthUser } from '../auth/auth.schema';
import { Auth, CurrentUser } from '../auth/jwt-auth.guard';
import { PagarPrestamoDto } from './prestamos.schema';
import { PrestamosService } from './prestamos.service';

@ApiTags('Préstamos')
@Controller('prestamos')
@Auth('CLIENTE')
export class PrestamosController {
  constructor(private readonly prestamos: PrestamosService) {}

  @Get()
  listar(@CurrentUser() user: AuthUser) {
    return this.prestamos.listar(user.sub);
  }

  @Get(':id')
  detalle(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.prestamos.detalle(user.sub, id);
  }

  /** Paga las próximas N cuotas pendientes con el saldo de una cuenta. */
  @Post(':id/pagar')
  @HttpCode(200)
  pagar(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: PagarPrestamoDto) {
    return this.prestamos.pagar(user.sub, id, dto);
  }
}
