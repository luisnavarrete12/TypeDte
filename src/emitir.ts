import type { Caf } from './core/ted/caf.ts';
import { CertificadoError, estaVigente, type Certificado } from './adapters/crypto/certificado.ts';
import { firmarDocumento } from './adapters/firma/firmar.ts';
import { timbrar } from './adapters/ted/timbrar.ts';
import { construirBoleta, datosTimbreBoleta } from './core/dte/boleta.ts';
import { agregarTimbre, construirDocumento, datosTimbre, envolverDte, idDocumento } from './core/dte/documento.ts';
import { construirExportacion, datosTimbreExportacion } from './core/dte/exportacion.ts';
import { construirLiquidacion, datosTimbreLiquidacion } from './core/dte/liquidacion.ts';
import {
    TIPO_BOLETA,
    TIPO_EXPORTACION,
    TIPO_LIQUIDACION_FACTURA,
    type Boleta,
    type DocumentoExportacion,
    type DocumentoTributario,
    type LiquidacionFactura,
} from './core/dte/tipos.ts';
import {
    calcularTotales,
    calcularTotalesBoleta,
    calcularTotalesExportacion,
    calcularTotalesLiquidacion,
    type Totales,
} from './core/dte/totales.ts';
import type { DatosTimbre } from './core/ted/ted.ts';
import type { XmlElement } from './core/xml/node.ts';
import { serialize, XML_DECLARATION } from './core/xml/serialize.ts';

/** Cualquiera de los 12 tipos de documento. */
export type DocumentoEmitible = DocumentoTributario | Boleta | DocumentoExportacion | LiquidacionFactura;

export interface OpcionesEmision {
    readonly caf: Caf;
    readonly certificado: Certificado;
    /**
     * Momento de la emision, en formato `AAAA-MM-DDTHH:MM:SS`. Va al timbre y a
     * la firma. Se recibe en vez de leer el reloj para que emitir dos veces lo
     * mismo produzca exactamente el mismo documento.
     */
    readonly timestamp: string;
}

export interface DocumentoEmitido {
    /** El XML final, firmado y en ISO-8859-1, listo para ir en un sobre. */
    readonly xml: string;
    /** El mismo documento como arbol, para ensobrarlo sin volver a parsearlo. */
    readonly firmado: XmlElement;
    readonly ted: XmlElement;
    readonly totales: Totales;
}

/**
 * Emite un documento en una sola llamada: calcula los totales, arma el XML,
 * lo timbra con el CAF y lo firma con el certificado.
 *
 * Antes de tocar nada verifica lo que haria fallar el envio: que el
 * certificado este vigente al momento de emitir, y (al timbrar) que el CAF
 * corresponda al tipo y que el folio este dentro de su rango.
 */
export function emitir(documento: DocumentoEmitible, opciones: OpcionesEmision): DocumentoEmitido {
    if (!estaVigente(opciones.certificado, new Date(opciones.timestamp))) {
        throw new CertificadoError(
            `El certificado no esta vigente el ${opciones.timestamp} ` +
                `(vale del ${opciones.certificado.validoDesde.toISOString().slice(0, 10)} ` +
                `al ${opciones.certificado.validoHasta.toISOString().slice(0, 10)}).`
        );
    }

    const { nodo, datos, totales } = armar(documento);
    const ted = timbrar(datos, opciones.caf, opciones.timestamp);
    const firmado = firmarDocumento(
        envolverDte(agregarTimbre(nodo, ted, opciones.timestamp)),
        idDocumento(documento.tipo, documento.folio),
        opciones.certificado
    );

    return { xml: XML_DECLARATION + serialize(firmado), firmado, ted, totales };
}

interface Armado {
    readonly nodo: XmlElement;
    readonly datos: DatosTimbre;
    readonly totales: Totales;
}

/**
 * Cada familia de documentos vive bajo un nodo distinto del esquema y calcula
 * sus montos a su manera. Aca se elige la que corresponde segun el tipo.
 */
function armar(documento: DocumentoEmitible): Armado {
    if (esBoleta(documento)) {
        const totales = calcularTotalesBoleta(documento);
        return { nodo: construirBoleta(documento, totales), datos: datosTimbreBoleta(documento, totales), totales };
    }

    if (esExportacion(documento)) {
        const totales = calcularTotalesExportacion(documento);
        return { nodo: construirExportacion(documento, totales), datos: datosTimbreExportacion(documento, totales), totales };
    }

    if (esLiquidacion(documento)) {
        const totales = calcularTotalesLiquidacion(documento);
        return { nodo: construirLiquidacion(documento, totales), datos: datosTimbreLiquidacion(documento, totales), totales };
    }

    const totales = calcularTotales(documento);
    return { nodo: construirDocumento(documento, totales), datos: datosTimbre(documento, totales), totales };
}

function esBoleta(documento: DocumentoEmitible): documento is Boleta {
    return documento.tipo === TIPO_BOLETA.AFECTA || documento.tipo === TIPO_BOLETA.EXENTA;
}

function esExportacion(documento: DocumentoEmitible): documento is DocumentoExportacion {
    return (
        documento.tipo === TIPO_EXPORTACION.FACTURA ||
        documento.tipo === TIPO_EXPORTACION.NOTA_DEBITO ||
        documento.tipo === TIPO_EXPORTACION.NOTA_CREDITO
    );
}

function esLiquidacion(documento: DocumentoEmitible): documento is LiquidacionFactura {
    return documento.tipo === TIPO_LIQUIDACION_FACTURA;
}
