import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { AuthUser } from '../auth/auth.schema';
import { Auth, CurrentUser } from '../auth/jwt-auth.guard';
import { PaginacionDto } from '../common/pagination.schema';
import { PagarServicioDto } from './servicios.schema';
import { ServiciosService } from './servicios.service';

@ApiTags('Pago de servicios')
@Controller('servicios')
@Auth('CLIENTE')
export class ServiciosController {
  constructor(private readonly servicios: ServiciosService) {}

  @Get()
  catalogo() {
    return this.servicios.catalogo();
  }

  @Post('pagar')
  pagar(@CurrentUser() user: AuthUser, @Body() dto: PagarServicioDto) {
    return this.servicios.pagar(user.sub, dto);
  }

  @Get('pagos')
  historial(@CurrentUser() user: AuthUser, @Query() q: PaginacionDto) {
    return this.servicios.historial(user.sub, q.page, q.limit);
  }
}
