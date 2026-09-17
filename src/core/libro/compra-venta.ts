import { NS_SII } from '../dte/documento.ts';
import { TIPO_BOLETA } from '../dte/tipos.ts';
import { rutSii } from '../dte/partes.ts';
import { TASA_IVA, type Totales } from '../dte/totales.ts';
import { el, fields, textElements, type XmlElement } from '../xml/node.ts';
import type {
    CaratulaLibro,
    LibroCompraVenta,
    LineaLibroCompraVenta,
    OtroImpuesto,
    TipoEnvioLibro,
} from './tipos.ts';

export const ID_ENVIO_LIBRO = 'EnvioLibro';

const TIPO_ENVIO: Readonly<Record<TipoEnvioLibro, string>> = {
    total: 'TOTAL',
    ajuste: 'AJUSTE',
    final: 'FINAL',
};

/**
 * Las boletas no se detallan una por una en el libro de ventas: se informan
 * solo en el resumen por tipo. Detallarlas seria un archivo con miles de
 * lineas por dia en cualquier comercio.
 */
const SOLO_EN_RESUMEN: ReadonlySet<number> = new Set([TIPO_BOLETA.AFECTA, TIPO_BOLETA.EXENTA]);

/**
 * Deriva la linea del libro de ventas desde un documento ya emitido.
 *
 * Toma los montos de los totales calculados al emitir, en vez de pedirlos de
 * nuevo: asi el libro no puede discrepar de los documentos que resume.
 */
export function lineaVentaDesde(
    documento: {
        readonly tipo: number;
        readonly folio: number;
        readonly fechaEmision: string;
        readonly receptor?: { readonly rut?: string; readonly razonSocial?: string };
    },
    totales: Totales
): LineaLibroCompraVenta {
    return {
        tipoDocumento: documento.tipo,
        folio: documento.folio,
        fecha: documento.fechaEmision,
        rut: documento.receptor?.rut ?? '66666666-6',
        razonSocial: documento.receptor?.razonSocial ?? '',
        exento: totales.exento,
        neto: totales.neto,
        iva: totales.iva,
        ...(totales.ivaRetenido > 0 ? { ivaRetenidoTotal: totales.ivaRetenido } : {}),
        total: totales.total,
    };
}

export function totalDeLinea(linea: LineaLibroCompraVenta): number {
    if (linea.anulado) {
        return 0;
    }

    if (linea.total !== undefined) {
        return linea.total;
    }

    const otros = (linea.otrosImpuestos ?? []).reduce((suma, impuesto) => suma + impuesto.monto, 0);

    return (linea.exento ?? 0) + (linea.neto ?? 0) + (linea.iva ?? 0) + otros - (linea.ivaRetenidoTotal ?? 0);
}

/**
 * Arma el libro de compras o de ventas de un periodo, listo para firmar.
 *
 * El resumen por tipo de documento se calcula desde las lineas. El SII
 * contrasta ese resumen con el detalle, asi que sumarlo a mano es otra forma
 * de que el libro no cuadre.
 */
export function construirLibroCompraVenta(libro: LibroCompraVenta): XmlElement {
    return el('LibroCompraVenta', { xmlns: NS_SII, version: '1.0' }, [
        el('EnvioLibro', { ID: ID_ENVIO_LIBRO }, [
            construirCaratula(libro.caratula, libro.operacion),
            el('ResumenPeriodo', undefined, resumirPorTipo(libro)),
            ...libro.lineas.filter((l) => !SOLO_EN_RESUMEN.has(l.tipoDocumento)).map(construirDetalle),
            el('TmstFirma', undefined, [libro.caratula.timestampFirma]),
        ]),
    ]);
}

function construirCaratula(caratula: CaratulaLibro, operacion: LibroCompraVenta['operacion']): XmlElement {
    return fields('Caratula', [
        ['RutEmisorLibro', rutSii(caratula.rutEmisor, 'emisor del libro')],
        ['RutEnvia', rutSii(caratula.rutEnvia, 'que envia')],
        ['PeriodoTributario', caratula.periodo],
        ['FchResol', caratula.fechaResolucion],
        ['NroResol', caratula.numeroResolucion],
        ['TipoOperacion', operacion === 'compra' ? 'COMPRA' : 'VENTA'],
        ['TipoLibro', 'MENSUAL'],
        ['TipoEnvio', TIPO_ENVIO[caratula.tipoEnvio ?? 'total']],
    ]);
}

function resumirPorTipo(libro: LibroCompraVenta): XmlElement[] {
    const porTipo = new Map<number, LineaLibroCompraVenta[]>();

    for (const linea of libro.lineas) {
        porTipo.set(linea.tipoDocumento, [...(porTipo.get(linea.tipoDocumento) ?? []), linea]);
    }

    return [...porTipo.entries()]
        .sort(([a], [b]) => a - b)
        .map(([tipo, lineas]) => construirTotalesTipo(tipo, lineas, libro.factorProporcionalidad));
}

function construirTotalesTipo(
    tipo: number,
    lineas: readonly LineaLibroCompraVenta[],
    factorProporcionalidad: number | undefined
): XmlElement {
    const vigentes = lineas.filter((l) => !l.anulado);
    const suma = (campo: (l: LineaLibroCompraVenta) => number | undefined): number =>
        vigentes.reduce((total, l) => total + (campo(l) ?? 0), 0);
    const cuenta = (condicion: (l: LineaLibroCompraVenta) => boolean): number => vigentes.filter(condicion).length;

    const anulados = lineas.length - vigentes.length;
    const ivaUsoComun = suma((l) => l.ivaUsoComun);
    const ivaRetenidoTotal = suma((l) => l.ivaRetenidoTotal);

    return el('TotalesPeriodo', undefined, [
        ...textElements([
            ['TpoDoc', tipo],
            ['TotDoc', lineas.length],
            ['TotAnulado', anulados > 0 ? anulados : undefined],
            ['TotOpExe', cuenta((l) => (l.exento ?? 0) > 0) || undefined],
            ['TotMntExe', suma((l) => l.exento)],
            ['TotMntNeto', suma((l) => l.neto)],
            ['TotMntIVA', suma((l) => l.iva)],
        ]),
        ...resumirIvaNoRecuperable(vigentes),
        ...textElements([
            ['TotOpIVAUsoComun', ivaUsoComun > 0 ? cuenta((l) => (l.ivaUsoComun ?? 0) > 0) : undefined],
            ['TotIVAUsoComun', ivaUsoComun > 0 ? ivaUsoComun : undefined],
            ['FctProp', ivaUsoComun > 0 ? factorProporcionalidad : undefined],
            [
                'TotCredIVAUsoComun',
                ivaUsoComun > 0 && factorProporcionalidad !== undefined
                    ? Math.round(ivaUsoComun * factorProporcionalidad)
                    : undefined,
            ],
        ]),
        ...resumirOtrosImpuestos(vigentes),
        ...textElements([
            ['TotOpIVARetTotal', ivaRetenidoTotal > 0 ? cuenta((l) => (l.ivaRetenidoTotal ?? 0) > 0) : undefined],
            ['TotIVARetTotal', ivaRetenidoTotal > 0 ? ivaRetenidoTotal : undefined],
            ['TotMntTotal', vigentes.reduce((total, l) => total + totalDeLinea(l), 0)],
        ]),
    ]);
}

function resumirIvaNoRecuperable(lineas: readonly LineaLibroCompraVenta[]): XmlElement[] {
    const porCodigo = new Map<number, { operaciones: number; monto: number }>();

    for (const linea of lineas) {
        for (const { codigo, monto } of linea.ivaNoRecuperable ?? []) {
            const actual = porCodigo.get(codigo) ?? { operaciones: 0, monto: 0 };
            porCodigo.set(codigo, { operaciones: actual.operaciones + 1, monto: actual.monto + monto });
        }
    }

    return [...porCodigo.entries()].map(([codigo, { operaciones, monto }]) =>
        fields('TotIVANoRec', [
            ['CodIVANoRec', codigo],
            ['TotOpIVANoRec', operaciones],
            ['TotMntIVANoRec', monto],
        ])
    );
}

function resumirOtrosImpuestos(lineas: readonly LineaLibroCompraVenta[]): XmlElement[] {
    const porCodigo = new Map<number, number>();

    for (const linea of lineas) {
        for (const { codigo, monto } of linea.otrosImpuestos ?? []) {
            porCodigo.set(codigo, (porCodigo.get(codigo) ?? 0) + monto);
        }
    }

    return [...porCodigo.entries()].map(([codigo, monto]) =>
        fields('TotOtrosImp', [
            ['CodImp', codigo],
            ['TotMntImp', monto],
        ])
    );
}

function construirDetalle(linea: LineaLibroCompraVenta): XmlElement {
    if (linea.anulado) {
        // Un documento anulado se informa solo con su identificacion.
        return fields('Detalle', [
            ['TpoDoc', linea.tipoDocumento],
            ['NroDoc', linea.folio],
            ['Anulado', 'A'],
        ]);
    }

    const tieneNeto = (linea.neto ?? 0) > 0;

    return el('Detalle', undefined, [
        ...textElements([
            ['TpoDoc', linea.tipoDocumento],
            ['NroDoc', linea.folio],
            ['TasaImp', tieneNeto ? TASA_IVA : undefined],
            ['FchDoc', linea.fecha],
            ['RUTDoc', rutSii(linea.rut, `documento ${linea.tipoDocumento} N° ${linea.folio}`)],
            ['RznSoc', linea.razonSocial],
            ['MntExe', linea.exento || undefined],
            ['MntNeto', linea.neto || undefined],
            ['MntIVA', linea.iva || undefined],
        ]),
        ...(linea.ivaNoRecuperable ?? []).map((iva) =>
            fields('IVANoRec', [
                ['CodIVANoRec', iva.codigo],
                ['MntIVANoRec', iva.monto],
            ])
        ),
        ...textElements([['IVAUsoComun', linea.ivaUsoComun]]),
        ...(linea.otrosImpuestos ?? []).map(construirOtroImpuesto),
        ...textElements([
            ['IVARetTotal', linea.ivaRetenidoTotal],
            ['MntTotal', totalDeLinea(linea)],
        ]),
    ]);
}

function construirOtroImpuesto(impuesto: OtroImpuesto): XmlElement {
    return fields('OtrosImp', [
        ['CodImp', impuesto.codigo],
        ['TasaImp', impuesto.tasa],
        ['MntImp', impuesto.monto],
    ]);
}
