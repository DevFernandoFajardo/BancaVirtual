import { Controller, Get } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Auth } from '../auth/jwt-auth.guard';

/** Datos de referencia (simulados): en producción vendrían de un proveedor de tipo de cambio. */
const TIPO_CAMBIO = [
  { moneda: 'USD', nombre: 'Dólar estadounidense', compra: 7.62, venta: 7.84 },
  { moneda: 'EUR', nombre: 'Euro', compra: 8.18, venta: 8.52 },
  { moneda: 'MXN', nombre: 'Peso mexicano', compra: 0.4, venta: 0.46 },
  { moneda: 'CAD', nombre: 'Dólar canadiense', compra: 5.5, venta: 5.86 },
  { moneda: 'GBP', nombre: 'Libra esterlina', compra: 9.56, venta: 9.98 },
];

@ApiTags('Extras')
@Controller('extras')
@Auth('CLIENTE')
export class ExtrasController {
  @Get('tipo-cambio')
  tipoCambio() {
    return {
      base: 'GTQ',
      referencial: true,
      actualizado: new Date().toISOString(),
      tasas: TIPO_CAMBIO,
    };
  }
}
