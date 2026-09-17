import type { Item, Moneda } from '../dte/tipos.ts';
import type { Totales, TotalesLiquidacion } from '../dte/totales.ts';
import type { XmlElement } from '../xml/node.ts';

/**
 * Lo que va impreso en el papel, ya resuelto y en orden.
 *
 * Separarlo del dibujo tiene un motivo practico: el contenido de la
 * representacion impresa es una regla del SII y se puede probar como datos,
 * mientras que la diagramacion es cosmetica y cada empresa la va a cambiar.
 */
export interface Representacion {
    readonly nombreDocumento: string;
    readonly tipoDte: number;
    readonly folio: number;
    readonly fechaEmision: string;
    readonly emisor: {
        readonly rut: string;
        readonly razonSocial: string;
        readonly giro?: string;
        readonly direccion?: string;
        readonly comuna?: string;
        readonly ciudad?: string;
        readonly telefono?: string;
        readonly correo?: string;
    };
    /** Oficina del SII que corresponde al emisor, como `SANTIAGO CENTRO`. */
    readonly unidadSii: string;
    readonly receptor?: {
        readonly rut?: string;
        readonly razonSocial?: string;
        readonly giro?: string;
        readonly direccion?: string;
        readonly comuna?: string;
        readonly ciudad?: string;
    };
    readonly lineas: readonly LineaImpresa[];
    readonly referencias: readonly ReferenciaImpresa[];
    readonly totales: readonly FilaTotal[];
    readonly moneda: Moneda | 'PESO CL';
    readonly resolucion: { readonly numero: number; readonly anio: number };
    readonly ted: XmlElement;
}

export interface LineaImpresa {
    readonly nombre: string;
    readonly descripcion?: string;
    readonly cantidad?: number;
    readonly unidad?: string;
    readonly precioUnitario?: number;
    readonly descuento?: number;
    readonly monto: number;
    readonly exento: boolean;
}

/**
 * Cubre las dos formas de referencia: la de facturas y notas, que apunta a otro
 * documento, y la de boletas, que es un codigo interno.
 */
export interface ReferenciaImpresa {
    readonly tipoDocumento?: number | string;
    readonly codigo?: string;
    readonly folio?: string | number;
    readonly fecha?: string;
    readonly razon?: string;
}

export interface FilaTotal {
    readonly etiqueta: string;
    readonly valor: number;
    /** La fila final, que se destaca. */
    readonly destacada?: boolean;
    /** Un descuento: se muestra con signo para que no se lea como suma. */
    readonly resta?: boolean;
}

const NOMBRES: Readonly<Record<number, string>> = {
    33: 'FACTURA ELECTRÓNICA',
    34: 'FACTURA NO AFECTA O EXENTA ELECTRÓNICA',
    39: 'BOLETA ELECTRÓNICA',
    41: 'BOLETA NO AFECTA O EXENTA ELECTRÓNICA',
    43: 'LIQUIDACIÓN FACTURA ELECTRÓNICA',
    46: 'FACTURA DE COMPRA ELECTRÓNICA',
    52: 'GUÍA DE DESPACHO ELECTRÓNICA',
    56: 'NOTA DE DÉBITO ELECTRÓNICA',
    61: 'NOTA DE CRÉDITO ELECTRÓNICA',
    110: 'FACTURA DE EXPORTACIÓN ELECTRÓNICA',
    111: 'NOTA DE DÉBITO DE EXPORTACIÓN ELECTRÓNICA',
    112: 'NOTA DE CRÉDITO DE EXPORTACIÓN ELECTRÓNICA',
};

export function nombreDocumento(tipoDte: number): string {
    const nombre = NOMBRES[tipoDte];

    if (nombre === undefined) {
        throw new Error(`No hay nombre impreso para el tipo de documento ${tipoDte}.`);
    }

    return nombre;
}

/**
 * La forma comun de todos los documentos que se pueden imprimir. Facturas,
 * boletas, exportaciones y liquidaciones la cumplen sin adaptarlas.
 */
export interface DocumentoImprimible {
    readonly tipo: number;
    readonly folio: number;
    readonly fechaEmision: string;
    readonly emisor: Representacion['emisor'];
    readonly receptor?: Representacion['receptor'];
    readonly items: readonly Item[];
    readonly referencias?: readonly ReferenciaImpresa[];
    readonly moneda?: Moneda;
}

export interface OpcionesRepresentacion {
    readonly unidadSii: string;
    readonly resolucion: { readonly numero: number; readonly fecha: string };
}

export function construirRepresentacion(
    documento: DocumentoImprimible,
    totales: Totales,
    ted: XmlElement,
    opciones: OpcionesRepresentacion
): Representacion {
    return {
        nombreDocumento: nombreDocumento(documento.tipo),
        tipoDte: documento.tipo,
        folio: documento.folio,
        fechaEmision: documento.fechaEmision,
        emisor: documento.emisor,
        unidadSii: opciones.unidadSii,
        ...(documento.receptor === undefined ? {} : { receptor: documento.receptor }),
        lineas: totales.lineas.map(({ item, monto, descuento, exento }) => ({
            nombre: item.nombre,
            ...(item.descripcion === undefined ? {} : { descripcion: item.descripcion }),
            ...(item.cantidad === undefined ? {} : { cantidad: item.cantidad }),
            ...(item.unidad === undefined ? {} : { unidad: item.unidad }),
            ...(item.precioUnitario === undefined ? {} : { precioUnitario: item.precioUnitario }),
            ...(descuento > 0 ? { descuento } : {}),
            monto,
            exento,
        })),
        referencias: documento.referencias ?? [],
        totales: filasDeTotales(totales),
        moneda: documento.moneda ?? 'PESO CL',
        resolucion: { numero: opciones.resolucion.numero, anio: Number(opciones.resolucion.fecha.slice(0, 4)) },
        ted,
    };
}

/**
 * Solo aparecen las filas que tienen algo. Un "IVA $0" en una factura exenta
 * es ruido, y en una boleta confunde al cliente.
 */
function filasDeTotales(totales: Totales): FilaTotal[] {
    const filas: FilaTotal[] = [];
    const agregar = (etiqueta: string, valor: number, resta = false): void => {
        if (valor > 0) {
            filas.push(resta ? { etiqueta, valor, resta } : { etiqueta, valor });
        }
    };

    for (const { movimiento, monto } of totales.movimientos) {
        const esDescuento = movimiento.tipo === 'descuento';
        agregar(esDescuento ? 'Descuento global' : 'Recargo global', monto, esDescuento);
    }

    agregar('Monto neto', totales.neto);
    agregar('Monto exento', totales.exento);
    agregar('IVA 19%', totales.iva);
    agregar('IVA retenido', totales.ivaRetenido);

    if (esLiquidacion(totales)) {
        agregar('Comisiones neto', totales.comisionNeto);
        agregar('Comisiones exento', totales.comisionExento);
        agregar('IVA comisiones', totales.comisionIva);
    }

    filas.push({ etiqueta: 'TOTAL', valor: totales.total, destacada: true });

    return filas;
}

function esLiquidacion(totales: Totales): totales is TotalesLiquidacion {
    return 'comisionNeto' in totales;
}
