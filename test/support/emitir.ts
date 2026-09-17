import { parseCaf } from '../../src/adapters/caf/parse.ts';
import { cargarCertificado } from '../../src/adapters/crypto/certificado.ts';
import { firmarDocumento } from '../../src/adapters/firma/firmar.ts';
import { timbrar } from '../../src/adapters/ted/timbrar.ts';
import {
    agregarTimbre,
    construirDocumento,
    datosTimbre,
    envolverDte,
    idDocumento,
} from '../../src/core/dte/documento.ts';
import type { DocumentoTributario, Emisor, Receptor } from '../../src/core/dte/tipos.ts';
import { calcularTotales } from '../../src/core/dte/totales.ts';
import { serialize, XML_DECLARATION } from '../../src/core/xml/serialize.ts';
import { generarCafFalso } from './caf-falso.ts';
import { generarCertificadoFalso } from './certificado-falso.ts';

export const EMISION = '2026-09-16';
export const TIMBRADO = '2026-09-16T10:30:00';
export const FIRMADO = '2026-09-16T10:30:05';

export const EMISOR: Emisor = {
    rut: '44444444-4',
    razonSocial: 'PANADERÍA ÑUÑOA SPA',
    giro: 'Elaboración de pan',
    actividadesEconomicas: [107100],
    direccion: 'Av. Irarrázaval 1234',
    comuna: 'Ñuñoa',
    ciudad: 'Santiago',
};

export const RECEPTOR: Receptor = {
    rut: '22222222-2',
    razonSocial: 'CLIENTE EJEMPLO SPA',
    giro: 'Comercio',
    direccion: 'Los Olmos 123',
    comuna: 'Temuco',
    ciudad: 'Temuco',
};

/**
 * Recorre el camino completo que hace un documento real antes de enviarse:
 * calcular, armar, timbrar con el CAF y firmar con el certificado. Todo con
 * credenciales falsas, para que los tests prueben la cadena entera sin red.
 */
export function emitir(documento: DocumentoTributario) {
    const caf = parseCaf(
        generarCafFalso({
            rutEmisor: documento.emisor.rut,
            tipoDte: documento.tipo,
            folioDesde: 1,
            folioHasta: 1000,
        })
    );
    const { p12, clave } = generarCertificadoFalso();
    const certificado = cargarCertificado(p12, clave);

    const totales = calcularTotales(documento);
    const ted = timbrar(datosTimbre(documento, totales), caf, TIMBRADO);
    const firmado = firmarDocumento(
        envolverDte(agregarTimbre(construirDocumento(documento, totales), ted, FIRMADO)),
        idDocumento(documento.tipo, documento.folio),
        certificado
    );

    return { caf, certificado, totales, ted, firmado, xml: XML_DECLARATION + serialize(firmado) };
}
