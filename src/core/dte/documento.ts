import type { DatosTimbre } from '../ted/ted.ts';
import { el, fields, textElements, type XmlElement } from '../xml/node.ts';
import { construirDetalle, construirEmisor, construirMovimiento, construirReferencia, FORMA_PAGO, rutSii } from './partes.ts';
import { TIPO, type DocumentoTributario, type Receptor } from './tipos.ts';
import { calcularTotales, IMPUESTO_IVA_RETENIDO_TOTAL, TASA_IVA, type Totales } from './totales.ts';

export const NS_SII = 'http://www.sii.cl/SiiDte';

/** El ID del nodo firmado. Es la convencion que usa el SII en sus ejemplos. */
export function idDocumento(tipo: number, folio: number): string {
    return `F${folio}T${tipo}`;
}

/**
 * Arma el `Documento` de cualquier tipo que vive bajo ese nodo del esquema:
 * facturas afecta, exenta y de compra, guia de despacho y notas.
 *
 * El timbre y la firma se agregan despues, en ese orden: el timbre entra al
 * documento, y la firma se calcula sobre el documento ya timbrado.
 */
export function construirDocumento(
    documento: DocumentoTributario,
    totales: Totales = calcularTotales(documento)
): XmlElement {
    return el('Documento', { ID: idDocumento(documento.tipo, documento.folio) }, [
        construirEncabezado(documento, totales),
        // En una factura exenta el documento completo es exento; el indicador por
        // linea solo distingue lineas exentas dentro de un documento afecto.
        ...totales.lineas.map((linea, indice) =>
            construirDetalle(linea, indice + 1, linea.exento && documento.tipo !== TIPO.FACTURA_EXENTA)
        ),
        ...totales.movimientos.map((movimiento, indice) => construirMovimiento(movimiento, indice + 1)),
        ...(documento.referencias ?? []).map((referencia, indice) =>
            construirReferencia(referencia, indice + 1)
        ),
    ]);
}

/** Lo que el timbre necesita, derivado del documento para no mapearlo a mano. */
export function datosTimbre(
    documento: DocumentoTributario,
    totales: Totales = calcularTotales(documento)
): DatosTimbre {
    return {
        tipoDte: documento.tipo,
        folio: documento.folio,
        fechaEmision: documento.fechaEmision,
        rutEmisor: rutSii(documento.emisor.rut, 'emisor'),
        rutReceptor: rutSii(documento.receptor.rut, 'receptor'),
        razonSocialReceptor: documento.receptor.razonSocial,
        montoTotal: totales.total,
        primerItem: documento.items[0].nombre,
    };
}

/**
 * Inserta el timbre y la marca de tiempo de la firma dentro del documento.
 *
 * `TmstFirma` va despues del `TED` y es obligatorio: sin el, el esquema
 * rechaza el documento aunque todo lo demas este correcto.
 */
export function agregarTimbre(
    documento: XmlElement,
    ted: XmlElement,
    timestampFirma: string
): XmlElement {
    return el(documento.name, documento.attrs, [
        ...(documento.children ?? []),
        ted,
        el('TmstFirma', undefined, [timestampFirma]),
    ]);
}

/** Envuelve el documento en el elemento raiz, con el namespace del SII. */
export function envolverDte(documento: XmlElement): XmlElement {
    return el('DTE', { xmlns: NS_SII, version: '1.0' }, [documento]);
}

function construirEncabezado(documento: DocumentoTributario, totales: Totales): XmlElement {
    return el('Encabezado', undefined, [
        construirIdDoc(documento),
        construirEmisor(documento.emisor),
        construirReceptor(documento.receptor),
        ...construirTransporte(documento),
        construirTotales(totales),
    ]);
}

function construirIdDoc(documento: DocumentoTributario): XmlElement {
    const esGuia = documento.tipo === TIPO.GUIA_DESPACHO;

    return fields('IdDoc', [
        ['TipoDTE', documento.tipo],
        ['Folio', documento.folio],
        ['FchEmis', documento.fechaEmision],
        ['TipoDespacho', esGuia ? documento.tipoDespacho : undefined],
        ['IndTraslado', esGuia ? documento.indicadorTraslado : undefined],
        ['FmaPago', documento.formaPago === undefined ? undefined : FORMA_PAGO[documento.formaPago]],
        ['FchVenc', documento.fechaVencimiento],
    ]);
}

function construirReceptor(receptor: Receptor): XmlElement {
    return fields('Receptor', [
        ['RUTRecep', rutSii(receptor.rut, 'receptor')],
        ['RznSocRecep', receptor.razonSocial],
        ['GiroRecep', receptor.giro],
        ['Contacto', receptor.contacto],
        ['CorreoRecep', receptor.correo],
        ['DirRecep', receptor.direccion],
        ['CmnaRecep', receptor.comuna],
        ['CiudadRecep', receptor.ciudad],
    ]);
}

function construirTransporte(documento: DocumentoTributario): XmlElement[] {
    if (documento.tipo !== TIPO.GUIA_DESPACHO || documento.transporte === undefined) {
        return [];
    }

    const { transporte } = documento;

    return [
        fields('Transporte', [
            ['Patente', transporte.patente],
            ['RUTTrans', transporte.rutTransportista === undefined ? undefined : rutSii(transporte.rutTransportista, 'transportista')],
            ['DirDest', transporte.direccionDestino],
            ['CmnaDest', transporte.comunaDestino],
            ['CiudadDest', transporte.ciudadDestino],
        ]),
    ];
}

/**
 * Solo se emiten los montos que existen. Un `MntNeto` en cero en una factura
 * exenta, o un `MntExe` en cero en una afecta, confunde al SII aunque el
 * esquema lo permita.
 */
function construirTotales(totales: Totales): XmlElement {
    const hayAfecto = totales.neto > 0;

    return el('Totales', undefined, [
        ...textElements([
            ['MntNeto', hayAfecto ? totales.neto : undefined],
            ['MntExe', totales.exento > 0 ? totales.exento : undefined],
            ['TasaIVA', hayAfecto ? TASA_IVA : undefined],
            ['IVA', hayAfecto ? totales.iva : undefined],
        ]),
        ...(totales.ivaRetenido > 0
            ? [
                  fields('ImptoReten', [
                      ['TipoImp', IMPUESTO_IVA_RETENIDO_TOTAL],
                      ['TasaImp', TASA_IVA],
                      ['MontoImp', totales.ivaRetenido],
                  ]),
              ]
            : []),
        el('MntTotal', undefined, [String(totales.total)]),
    ]);
}

