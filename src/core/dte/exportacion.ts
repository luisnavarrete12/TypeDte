import type { DatosTimbre } from '../ted/ted.ts';
import { el, fields, textElements, type XmlElement } from '../xml/node.ts';
import { idDocumento } from './documento.ts';
import { decimal } from './formato.ts';
import { construirDetalle, construirEmisor, construirMovimiento, construirReferencia, FORMA_PAGO, rutSii } from './partes.ts';
import type { Aduana, DocumentoExportacion, ReceptorExtranjero } from './tipos.ts';
import { calcularTotalesExportacion, type Totales } from './totales.ts';

/** RUT generico que el SII usa para un receptor extranjero sin RUT chileno. */
export const RUT_EXTRANJERO = '55555555-5';

/** Factura de servicio, segun el indicador del esquema de exportacion. */
const INDICADOR_SERVICIO_EXPORTACION = 3;

/**
 * Arma un documento de exportacion (110, 111 y 112).
 *
 * Va en el mismo sobre que las facturas pero bajo el nodo `Exportaciones`, y
 * con reglas propias: todo es exento de IVA, los montos van en la moneda
 * pactada con el cliente, y el transporte lleva un bloque de aduana.
 */
export function construirExportacion(
    documento: DocumentoExportacion,
    totales: Totales = calcularTotalesExportacion(documento)
): XmlElement {
    return el('Exportaciones', { ID: idDocumento(documento.tipo, documento.folio) }, [
        el('Encabezado', undefined, [
            fields('IdDoc', [
                ['TipoDTE', documento.tipo],
                ['Folio', documento.folio],
                ['FchEmis', documento.fechaEmision],
                ['IndServicio', documento.esServicio ? INDICADOR_SERVICIO_EXPORTACION : undefined],
                ['FmaPago', documento.formaPago === undefined ? undefined : FORMA_PAGO[documento.formaPago]],
            ]),
            construirEmisor(documento.emisor),
            construirReceptor(documento.receptor),
            ...(documento.aduana === undefined ? [] : [el('Transporte', undefined, [construirAduana(documento.aduana)])]),
            fields('Totales', [
                ['TpoMoneda', documento.moneda],
                ['MntExe', decimal(totales.exento, 4)],
                ['MntTotal', decimal(totales.total, 4)],
            ]),
        ]),
        ...totales.lineas.map((linea, indice) => construirDetalle(linea, indice + 1, false)),
        ...totales.movimientos.map((movimiento, indice) => construirMovimiento(movimiento, indice + 1)),
        ...(documento.referencias ?? []).map((referencia, indice) => construirReferencia(referencia, indice + 1)),
    ]);
}

/**
 * Datos del timbre de una exportacion.
 *
 * El monto del timbre es un entero en el esquema, pero el total de una
 * exportacion lleva decimales de moneda extranjera. Se redondea a la unidad.
 */
export function datosTimbreExportacion(
    documento: DocumentoExportacion,
    totales: Totales = calcularTotalesExportacion(documento)
): DatosTimbre {
    return {
        tipoDte: documento.tipo,
        folio: documento.folio,
        fechaEmision: documento.fechaEmision,
        rutEmisor: rutSii(documento.emisor.rut, 'emisor'),
        rutReceptor: rutSii(documento.receptor.rut ?? RUT_EXTRANJERO, 'receptor'),
        razonSocialReceptor: documento.receptor.razonSocial,
        montoTotal: Math.round(totales.total),
        primerItem: documento.items[0].nombre,
    };
}

function construirReceptor(receptor: ReceptorExtranjero): XmlElement {
    const tieneIdentificacion =
        receptor.numeroIdentificacion !== undefined || receptor.nacionalidad !== undefined;

    return el('Receptor', undefined, [
        ...textElements([
            ['RUTRecep', rutSii(receptor.rut ?? RUT_EXTRANJERO, 'receptor')],
            ['RznSocRecep', receptor.razonSocial],
        ]),
        ...(tieneIdentificacion
            ? [
                  fields('Extranjero', [
                      ['NumId', receptor.numeroIdentificacion],
                      ['Nacionalidad', receptor.nacionalidad],
                  ]),
              ]
            : []),
        ...textElements([
            ['GiroRecep', receptor.giro],
            ['CorreoRecep', receptor.correo],
            ['DirRecep', receptor.direccion],
            ['CiudadRecep', receptor.ciudad],
        ]),
    ]);
}

function construirAduana(aduana: Aduana): XmlElement {
    return el('Aduana', undefined, [
        ...textElements([
            ['CodModVenta', aduana.modalidadVenta],
            ['CodClauVenta', aduana.clausulaVenta],
            ['TotClauVenta', decimal(aduana.totalClausulaVenta, 2)],
            ['CodViaTransp', aduana.viaTransporte],
            ['NombreTransp', aduana.nombreTransporte],
            ['CodPtoEmbarque', aduana.puertoEmbarque],
            ['CodPtoDesemb', aduana.puertoDesembarque],
            ['PesoBruto', decimal(aduana.pesoBruto, 2)],
            ['CodUnidPesoBruto', aduana.unidadPesoBruto],
            ['PesoNeto', decimal(aduana.pesoNeto, 2)],
            ['CodUnidPesoNeto', aduana.unidadPesoNeto],
            ['TotBultos', aduana.totalBultos],
        ]),
        ...(aduana.bultos ?? []).map((bulto) =>
            fields('TipoBultos', [
                ['CodTpoBultos', bulto.tipo],
                ['CantBultos', bulto.cantidad],
                ['Marcas', bulto.marcas],
                ['IdContainer', bulto.idContenedor],
                ['Sello', bulto.sello],
            ])
        ),
        ...textElements([
            ['MntFlete', decimal(aduana.flete, 4)],
            ['MntSeguro', decimal(aduana.seguro, 4)],
            ['CodPaisRecep', aduana.paisReceptor],
            ['CodPaisDestin', aduana.paisDestino],
        ]),
    ]);
}
