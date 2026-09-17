import {
    TIPO,
    TIPO_BOLETA,
    type Boleta,
    type DocumentoExportacion,
    type DocumentoTributario,
    type Item,
    type LiquidacionFactura,
    type MovimientoGlobal,
} from './tipos.ts';

export const TASA_IVA = 19;
export const MAXIMO_LINEAS = 60;
export const MAXIMO_LINEAS_BOLETA = 1000;

/** Codigo del SII para IVA retenido total, el que aplica la factura de compra. */
export const IMPUESTO_IVA_RETENIDO_TOTAL = 15;

/** Redondeo al peso: los montos en moneda nacional no llevan decimales. */
const aPesos = (valor: number): number => Math.round(valor);

/** Los montos en moneda extranjera admiten hasta 4 decimales. */
const aCuatroDecimales = (valor: number): number => Math.round(valor * 10_000) / 10_000;

export class DocumentoInvalidoError extends Error {
    constructor(mensaje: string) {
        super(mensaje);
        this.name = 'DocumentoInvalidoError';
    }
}

export interface LineaCalculada {
    readonly item: Item;
    readonly exento: boolean;
    readonly descuento: number;
    readonly monto: number;
}

export interface MovimientoCalculado {
    readonly movimiento: MovimientoGlobal;
    readonly monto: number;
}

export interface Totales {
    readonly lineas: readonly LineaCalculada[];
    readonly movimientos: readonly MovimientoCalculado[];
    readonly neto: number;
    readonly exento: number;
    readonly iva: number;
    readonly ivaRetenido: number;
    readonly total: number;
}

/**
 * Calcula los montos de una factura, guia o nota a partir de sus lineas.
 *
 * Se calculan en vez de recibirse porque el SII rechaza un documento cuyos
 * totales no calzan con el detalle, y ese descuadre es el error mas comun al
 * armar facturas a mano. Si el codigo suma, no hay forma de mandarlos mal.
 *
 * En estos documentos los precios van netos y el IVA se suma encima.
 */
export function calcularTotales(documento: DocumentoTributario): Totales {
    const { lineas, movimientos, afecto, exento } = calcularDetalle(
        documento.items,
        documento.movimientosGlobales,
        documento.tipo === TIPO.FACTURA_EXENTA,
        MAXIMO_LINEAS,
        aPesos
    );

    const iva = Math.round((afecto * TASA_IVA) / 100);
    const ivaRetenido = documento.tipo === TIPO.FACTURA_COMPRA ? iva : 0;

    return {
        lineas,
        movimientos,
        neto: afecto,
        exento,
        iva,
        ivaRetenido,
        total: afecto + iva + exento - ivaRetenido,
    };
}

/**
 * Calcula los montos de una boleta.
 *
 * Al reves que en una factura, los precios de una boleta ya traen el IVA: son
 * lo que paga el cliente en el mesón. Aca se desglosa hacia atras. El IVA se
 * obtiene por diferencia y no multiplicando, para que neto mas IVA sume
 * exactamente el total cobrado y no se pierda un peso en el redondeo.
 */
export function calcularTotalesBoleta(boleta: Boleta): Totales {
    const { lineas, movimientos, afecto, exento } = calcularDetalle(
        boleta.items,
        boleta.movimientosGlobales,
        boleta.tipo === TIPO_BOLETA.EXENTA,
        MAXIMO_LINEAS_BOLETA,
        aPesos
    );

    const neto = Math.round(afecto / (1 + TASA_IVA / 100));

    return {
        lineas,
        movimientos,
        neto,
        exento,
        iva: afecto - neto,
        ivaRetenido: 0,
        total: afecto + exento,
    };
}

/**
 * Calcula los montos de un documento de exportacion.
 *
 * Toda exportacion es exenta de IVA, y los montos van en la moneda pactada con
 * el cliente extranjero, con hasta 4 decimales. Redondear a pesos enteros aca
 * haria perder centavos de dolar en cada linea.
 */
export function calcularTotalesExportacion(documento: DocumentoExportacion): Totales {
    const { lineas, movimientos, exento } = calcularDetalle(
        documento.items,
        documento.movimientosGlobales,
        true,
        MAXIMO_LINEAS,
        aCuatroDecimales
    );

    return { lineas, movimientos, neto: 0, exento, iva: 0, ivaRetenido: 0, total: exento };
}

export interface TotalesLiquidacion extends Totales {
    readonly comisionNeto: number;
    readonly comisionExento: number;
    readonly comisionIva: number;
}

/**
 * Calcula una liquidacion-factura: lo vendido por cuenta del mandante, menos
 * las comisiones y cargos del consignatario con su propio IVA.
 *
 * El total es lo que efectivamente se le rinde al mandante. Si las comisiones
 * superan las ventas, el consignatario no tiene nada que liquidar y el
 * documento no corresponde.
 */
export function calcularTotalesLiquidacion(liquidacion: LiquidacionFactura): TotalesLiquidacion {
    const ventas = calcularTotales({ ...liquidacion, tipo: TIPO.FACTURA_AFECTA });

    const lineas = liquidacion.comisiones.map(calcularComision);
    const comisionNeto = sumar(lineas.map((c) => c.neto));
    const comisionExento = sumar(lineas.map((c) => c.exento));
    // Se suma el IVA de cada linea en vez de calcularlo sobre el total, para
    // que las lineas del documento cuadren exacto con sus totales.
    const comisionIva = sumar(lineas.map((c) => c.iva));

    const total = ventas.total - comisionNeto - comisionExento - comisionIva;

    if (total < 0) {
        throw new DocumentoInvalidoError(
            `Las comisiones (${comisionNeto + comisionExento + comisionIva}) superan lo vendido (${ventas.total}).`
        );
    }

    return { ...ventas, comisionNeto, comisionExento, comisionIva, total };
}

export interface ComisionCalculada {
    readonly neto: number;
    readonly exento: number;
    readonly iva: number;
}

export function calcularComision(comision: { readonly neto: number; readonly exento?: number }): ComisionCalculada {
    assertNoNegativo(comision.neto, 'El neto de una comision');
    assertNoNegativo(comision.exento ?? 0, 'El exento de una comision');

    const neto = aPesos(comision.neto);

    return { neto, exento: aPesos(comision.exento ?? 0), iva: aPesos((neto * TASA_IVA) / 100) };
}

interface Detalle {
    readonly lineas: readonly LineaCalculada[];
    readonly movimientos: readonly MovimientoCalculado[];
    /** Suma afecta, ya con descuentos y recargos globales aplicados. */
    readonly afecto: number;
    readonly exento: number;
}

function calcularDetalle(
    items: readonly Item[],
    movimientosGlobales: readonly MovimientoGlobal[] | undefined,
    todoExento: boolean,
    maximoLineas: number,
    redondear: (valor: number) => number
): Detalle {
    if (items.length > maximoLineas) {
        throw new DocumentoInvalidoError(
            `El documento tiene ${items.length} lineas y el SII admite hasta ${maximoLineas}.`
        );
    }

    const lineas = items.map((item, indice) => calcularLinea(item, indice + 1, todoExento, redondear));
    const afectoLineas = redondear(sumar(lineas.filter((l) => !l.exento).map((l) => l.monto)));
    const exentoLineas = redondear(sumar(lineas.filter((l) => l.exento).map((l) => l.monto)));

    // Los descuentos y recargos globales se aplican sobre lo afecto. En un
    // documento completamente exento no hay afecto, asi que van sobre lo exento.
    const base = todoExento ? exentoLineas : afectoLineas;
    const movimientos = (movimientosGlobales ?? []).map((m, indice) =>
        calcularMovimiento(m, indice + 1, base, redondear)
    );
    const ajuste = sumar(movimientos.map(({ movimiento, monto }) => (movimiento.tipo === 'recargo' ? monto : -monto)));

    const afecto = todoExento ? afectoLineas : redondear(afectoLineas + ajuste);
    const exento = todoExento ? redondear(exentoLineas + ajuste) : exentoLineas;

    if (afecto < 0 || exento < 0) {
        throw new DocumentoInvalidoError('Los descuentos globales dejan el monto bajo cero.');
    }

    return { lineas, movimientos, afecto, exento };
}

function calcularLinea(
    item: Item,
    numero: number,
    todoExento: boolean,
    redondear: (valor: number) => number
): LineaCalculada {
    const exento = todoExento || item.exento === true;

    if (item.monto !== undefined) {
        assertNoNegativo(item.monto, `El monto de la linea ${numero}`);
        return { item, exento, descuento: item.descuentoMonto ?? 0, monto: redondear(item.monto) };
    }

    if (item.cantidad === undefined || item.precioUnitario === undefined) {
        throw new DocumentoInvalidoError(
            `La linea ${numero} ("${item.nombre}") necesita monto, o cantidad y precio unitario.`
        );
    }

    if (item.descuentoMonto !== undefined && item.descuentoPorcentaje !== undefined) {
        throw new DocumentoInvalidoError(
            `La linea ${numero} tiene descuento en monto y en porcentaje a la vez; usa uno.`
        );
    }

    const bruto = redondear(item.cantidad * item.precioUnitario);
    const descuento =
        item.descuentoMonto ??
        (item.descuentoPorcentaje === undefined ? 0 : redondear((bruto * item.descuentoPorcentaje) / 100));
    const monto = redondear(bruto - descuento);

    assertNoNegativo(monto, `El monto de la linea ${numero}`);

    return { item, exento, descuento, monto };
}

function calcularMovimiento(
    movimiento: MovimientoGlobal,
    numero: number,
    base: number,
    redondear: (valor: number) => number
): MovimientoCalculado {
    const tienePorcentaje = movimiento.porcentaje !== undefined;

    if (tienePorcentaje === (movimiento.monto !== undefined)) {
        throw new DocumentoInvalidoError(
            `El ${movimiento.tipo} global ${numero} debe tener porcentaje o monto, uno de los dos.`
        );
    }

    const monto = tienePorcentaje
        ? redondear((base * movimiento.porcentaje!) / 100)
        : redondear(movimiento.monto!);

    assertNoNegativo(monto, `El ${movimiento.tipo} global ${numero}`);

    return { movimiento, monto };
}

function sumar(valores: readonly number[]): number {
    return valores.reduce((total, valor) => total + valor, 0);
}

function assertNoNegativo(valor: number, que: string): void {
    if (valor < 0) {
        throw new DocumentoInvalidoError(`${que} no puede ser negativo (${valor}).`);
    }
}
