import { NS_SII } from '../dte/documento.ts';
import type { GuiaDespacho } from '../dte/tipos.ts';
import { rutSii } from '../dte/partes.ts';
import { TASA_IVA, type Totales } from '../dte/totales.ts';
import { el, fields, textElements, type XmlElement } from '../xml/node.ts';
import { ID_ENVIO_LIBRO } from './compra-venta.ts';
import type { LibroGuias, LineaLibroGuias } from './tipos.ts';

const ANULADA: Readonly<Record<NonNullable<LineaLibroGuias['anulada']>, number>> = {
    antes_de_enviar: 1,
    despues_de_enviar: 2,
};

/** El traslado que constituye venta. Se resume aparte de los demas. */
const TRASLADO_VENTA = 1;

/**
 * El detalle del libro solo acepta motivos del 1 al 7. Los traslados para
 * exportacion (8 y 9) se informan en el resumen pero no como tipo de operacion.
 */
const MAXIMO_TIPO_OPERACION = 7;

export function lineaGuiaDesde(guia: GuiaDespacho, totales: Totales): LineaLibroGuias {
    return {
        folio: guia.folio,
        fecha: guia.fechaEmision,
        rut: guia.receptor.rut,
        razonSocial: guia.receptor.razonSocial,
        indicadorTraslado: guia.indicadorTraslado,
        neto: totales.neto,
        iva: totales.iva,
        total: totales.total,
    };
}

/**
 * Arma el libro de guias de despacho.
 *
 * A diferencia del de compras y ventas, este es siempre un libro especial: el
 * SII lo pide con una notificacion y no se envia por iniciativa propia.
 */
export function construirLibroGuias(libro: LibroGuias): XmlElement {
    const { caratula } = libro;

    return el('LibroGuia', { xmlns: NS_SII, version: '1.0' }, [
        el('EnvioLibro', { ID: ID_ENVIO_LIBRO }, [
            fields('Caratula', [
                ['RutEmisorLibro', rutSii(caratula.rutEmisor, 'emisor del libro')],
                ['RutEnvia', rutSii(caratula.rutEnvia, 'que envia')],
                ['PeriodoTributario', caratula.periodo],
                ['FchResol', caratula.fechaResolucion],
                ['NroResol', caratula.numeroResolucion],
                ['TipoLibro', 'ESPECIAL'],
                ['TipoEnvio', (caratula.tipoEnvio ?? 'total').toUpperCase()],
                ['FolioNotificacion', libro.folioNotificacion],
            ]),
            construirResumen(libro.lineas),
            ...libro.lineas.map(construirDetalle),
            el('TmstFirma', undefined, [caratula.timestampFirma]),
        ]),
    ]);
}

function construirResumen(lineas: readonly LineaLibroGuias[]): XmlElement {
    const vigentes = lineas.filter((l) => l.anulada === undefined);
    const ventas = vigentes.filter((l) => l.indicadorTraslado === TRASLADO_VENTA);

    const anuladasAntes = lineas.filter((l) => l.anulada === 'antes_de_enviar').length;
    const anuladasDespues = lineas.filter((l) => l.anulada === 'despues_de_enviar').length;

    const traslados = new Map<number, { cantidad: number; monto: number }>();
    for (const linea of vigentes.filter((l) => l.indicadorTraslado !== TRASLADO_VENTA)) {
        const actual = traslados.get(linea.indicadorTraslado) ?? { cantidad: 0, monto: 0 };
        traslados.set(linea.indicadorTraslado, {
            cantidad: actual.cantidad + 1,
            monto: actual.monto + (linea.total ?? 0),
        });
    }

    return el('ResumenPeriodo', undefined, [
        ...textElements([
            ['TotFolAnulado', anuladasAntes || undefined],
            ['TotGuiaAnulada', anuladasDespues || undefined],
            ['TotGuiaVenta', ventas.length],
            ['TotMntGuiaVta', ventas.reduce((suma, l) => suma + (l.total ?? 0), 0)],
        ]),
        ...[...traslados.entries()]
            .sort(([a], [b]) => a - b)
            .map(([tipo, { cantidad, monto }]) =>
                fields('TotTraslado', [
                    ['TpoTraslado', tipo],
                    ['CantGuia', cantidad],
                    ['MntGuia', monto],
                ])
            ),
    ]);
}

function construirDetalle(linea: LineaLibroGuias): XmlElement {
    const tieneNeto = (linea.neto ?? 0) > 0;

    return fields('Detalle', [
        ['Folio', linea.folio],
        ['Anulado', linea.anulada === undefined ? undefined : ANULADA[linea.anulada]],
        ['TpoOper', linea.indicadorTraslado <= MAXIMO_TIPO_OPERACION ? linea.indicadorTraslado : undefined],
        ['FchDoc', linea.fecha],
        ['RUTDoc', rutSii(linea.rut, `guia N° ${linea.folio}`)],
        ['RznSoc', linea.razonSocial],
        ['MntNeto', tieneNeto ? linea.neto : undefined],
        ['TasaImp', tieneNeto ? TASA_IVA : undefined],
        ['IVA', tieneNeto ? linea.iva : undefined],
        ['MntTotal', linea.total],
        ['TpoDocRef', linea.facturaReferenciada?.tipo],
        ['FolioDocRef', linea.facturaReferenciada?.folio],
        ['FchDocRef', linea.facturaReferenciada?.fecha],
    ]);
}
