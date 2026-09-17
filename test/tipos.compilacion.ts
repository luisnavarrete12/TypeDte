/**
 * Errores que no llegan a correr: los detecta el compilador.
 *
 * Cada `@ts-expect-error` afirma que la linea siguiente NO compila. Si algun
 * dia un cambio en los tipos la deja compilar, `npm run check` falla. Es la
 * prueba de que el modelo impide armar documentos que el SII rechazaria.
 */
import { construirDocumento } from '../src/core/dte/documento.ts';
import { TIPO, TIPO_BOLETA, TIPO_LIQUIDACION_FACTURA, type BoletaAfecta, type DocumentoTributario, type GuiaDespacho, type LiquidacionFactura, type NotaCredito } from '../src/core/dte/tipos.ts';
import { EMISION, EMISOR, RECEPTOR } from './support/emitir.ts';

const BASE = { folio: 1, fechaEmision: EMISION, emisor: EMISOR, receptor: RECEPTOR } as const;
const ITEMS = [{ nombre: 'Pan', monto: 1000 }] as const;

// @ts-expect-error una nota de credito sin referencias no existe
export const notaSinReferencias: NotaCredito = { ...BASE, tipo: TIPO.NOTA_CREDITO, items: ITEMS };

// @ts-expect-error la lista de referencias de una nota no puede ir vacia
export const notaConReferenciasVacias: NotaCredito = { ...BASE, tipo: TIPO.NOTA_CREDITO, items: ITEMS, referencias: [] };

// @ts-expect-error una guia de despacho sin motivo de traslado
export const guiaSinTraslado: GuiaDespacho = { ...BASE, tipo: TIPO.GUIA_DESPACHO, items: ITEMS };

// @ts-expect-error el motivo de traslado solo va de 1 a 9
export const guiaTrasladoInvalido: GuiaDespacho = { ...BASE, tipo: TIPO.GUIA_DESPACHO, items: ITEMS, indicadorTraslado: 10 };

// @ts-expect-error un documento sin lineas
export const sinLineas: DocumentoTributario = { ...BASE, tipo: TIPO.FACTURA_AFECTA, items: [] };

// @ts-expect-error un tipo de documento que no existe
export const tipoInexistente: DocumentoTributario = { ...BASE, tipo: 99, items: ITEMS };

// @ts-expect-error el emisor necesita al menos una actividad economica
export const emisorSinActividad: DocumentoTributario = { ...BASE, emisor: { ...EMISOR, actividadesEconomicas: [] }, tipo: TIPO.FACTURA_AFECTA, items: ITEMS };

// @ts-expect-error el codigo de referencia es una intencion con nombre, no un numero suelto
export const codigoNumerico: NotaCredito = { ...BASE, tipo: TIPO.NOTA_CREDITO, items: ITEMS, referencias: [{ tipoDocumento: 33, folio: 1, fecha: EMISION, codigo: 1 }] };

const boleta: BoletaAfecta = { folio: 1, fechaEmision: EMISION, emisor: EMISOR, tipo: TIPO_BOLETA.AFECTA, items: ITEMS };

// @ts-expect-error una boleta no se arma con el constructor de facturas: va en otro sobre y otro esquema
export const boletaComoFactura = construirDocumento(boleta);

const venta = { nombre: 'Venta', monto: 1000, tipoDocumentoLiquidado: 33 } as const;
const comision = { tipo: 'comision', glosa: 'Comision', neto: 100 } as const;

// @ts-expect-error una liquidacion sin comisiones no tiene nada que liquidar
export const liquidacionSinComisiones: LiquidacionFactura = { ...BASE, tipo: TIPO_LIQUIDACION_FACTURA, items: [venta], comisiones: [] };

// @ts-expect-error cada venta liquidada tiene que decir con que documento se hizo
export const ventaSinTipo: LiquidacionFactura = { ...BASE, tipo: TIPO_LIQUIDACION_FACTURA, items: [{ nombre: 'Venta', monto: 1000 }], comisiones: [comision] };

// @ts-expect-error el esquema no admite descuentos por linea en una liquidacion
export const liquidacionConDescuento: LiquidacionFactura = { ...BASE, tipo: TIPO_LIQUIDACION_FACTURA, items: [{ ...venta, descuentoMonto: 10 }], comisiones: [comision] };
