import { Body, Controller, Get, HttpCode, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { AuthUser } from '../auth/auth.schema';
import { Auth, CurrentUser } from '../auth/jwt-auth.guard';
import { PaginacionDto } from '../common/pagination.schema';
import { ConsultarServicioDto, PagarServicioDto } from './servicios.schema';
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

  /** Indica si los pagos van a la API externa o al modo simulado. */
  @Get('modo')
  modo() {
    return this.servicios.modo();
  }

  /** Consulta al proveedor externo el monto adeudado de un contrato (si lo ofrece). */
  @Post('consultar')
  @HttpCode(200)
  consultar(@Body() dto: ConsultarServicioDto) {
    return this.servicios.consultar(dto);
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
