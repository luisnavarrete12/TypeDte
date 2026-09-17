import type { IndicadorTraslado } from '../dte/tipos.ts';

/**
 * Libros electronicos: el resumen mensual de lo que se vendio, compro o
 * traslado, que el contribuyente le informa al SII.
 *
 * Desde 2017 el SII arma el Registro de Compras y Ventas solo, a partir de los
 * documentos que recibe. Estos libros siguen existiendo para la certificacion,
 * para rectificar un periodo y cuando el SII los pide con una notificacion.
 */

export type TipoOperacionLibro = 'compra' | 'venta';

/**
 * `total` manda el periodo completo de una vez. `ajuste` y `final` corrigen
 * un libro ya enviado. El envio por segmentos parciales no esta soportado:
 * solo tiene sentido con volumenes que no caben en un archivo.
 */
export type TipoEnvioLibro = 'total' | 'ajuste' | 'final';

export interface CaratulaLibro {
    readonly rutEmisor: string;
    /** RUT del titular del certificado que firma el envio. */
    readonly rutEnvia: string;
    /** Periodo tributario en formato `AAAA-MM`. */
    readonly periodo: string;
    readonly fechaResolucion: string;
    readonly numeroResolucion: number;
    readonly tipoEnvio?: TipoEnvioLibro;
    readonly timestampFirma: string;
}

/** Codigos del SII para IVA que no da derecho a credito. */
export type CodigoIvaNoRecuperable = 1 | 2 | 3 | 4 | 9;

export interface IvaNoRecuperable {
    readonly codigo: CodigoIvaNoRecuperable;
    readonly monto: number;
}

export interface OtroImpuesto {
    /** Codigo del impuesto adicional segun la tabla del SII. */
    readonly codigo: number;
    readonly tasa?: number;
    readonly monto: number;
}

/**
 * Una linea del libro de compras o ventas: un documento, resumido a sus montos.
 *
 * En ventas se deriva del documento emitido con `lineaVentaDesde`. En compras
 * se arma a partir de las facturas que llegaron de los proveedores.
 */
export interface LineaLibroCompraVenta {
    readonly tipoDocumento: number;
    readonly folio: number;
    readonly fecha: string;
    readonly rut: string;
    readonly razonSocial: string;
    readonly anulado?: boolean;
    readonly exento?: number;
    readonly neto?: number;
    readonly iva?: number;
    /** Solo compras: IVA de gastos que se usan tanto en ventas afectas como exentas. */
    readonly ivaUsoComun?: number;
    /** Solo compras: IVA sin derecho a credito, hasta 5 codigos. */
    readonly ivaNoRecuperable?: readonly IvaNoRecuperable[];
    /** IVA retenido completo, como en una factura de compra. */
    readonly ivaRetenidoTotal?: number;
    readonly otrosImpuestos?: readonly OtroImpuesto[];
    /** Si se omite se calcula desde los montos de la linea. */
    readonly total?: number;
}

export interface LibroCompraVenta {
    readonly operacion: TipoOperacionLibro;
    readonly caratula: CaratulaLibro;
    readonly lineas: readonly LineaLibroCompraVenta[];
    /**
     * Solo compras con IVA de uso comun: la proporcion de ventas afectas sobre
     * el total, que define cuanto de ese IVA se puede usar como credito.
     */
    readonly factorProporcionalidad?: number;
}

/** Una guia del libro de guias. */
export interface LineaLibroGuias {
    readonly folio: number;
    readonly fecha: string;
    readonly rut: string;
    readonly razonSocial: string;
    readonly indicadorTraslado: IndicadorTraslado;
    /** Anulada antes o despues de enviarla al SII. */
    readonly anulada?: 'antes_de_enviar' | 'despues_de_enviar';
    readonly neto?: number;
    readonly iva?: number;
    readonly total?: number;
    /** La factura con que se termino vendiendo lo trasladado, si existe. */
    readonly facturaReferenciada?: { readonly tipo: number; readonly folio: number; readonly fecha: string };
}

export interface LibroGuias {
    readonly caratula: CaratulaLibro;
    /** El libro de guias solo se envia cuando el SII lo pide, con este folio. */
    readonly folioNotificacion: number;
    readonly lineas: readonly LineaLibroGuias[];
}
