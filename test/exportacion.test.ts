import { ok, strictEqual } from 'node:assert/strict';
import { describe, it } from 'node:test';

import { parseCaf } from '../src/adapters/caf/parse.ts';
import { cargarCertificado } from '../src/adapters/crypto/certificado.ts';
import { firmarDocumento } from '../src/adapters/firma/firmar.ts';
import { validarContraEsquema } from '../src/adapters/schema/validar.ts';
import { timbrar, verificarTimbre } from '../src/adapters/ted/timbrar.ts';
import { agregarTimbre, envolverDte, idDocumento } from '../src/core/dte/documento.ts';
import {
    construirExportacion,
    datosTimbreExportacion,
    RUT_EXTRANJERO,
} from '../src/core/dte/exportacion.ts';
import {
    TIPO_EXPORTACION,
    type DocumentoExportacion,
    type FacturaExportacion,
    type NotaCreditoExportacion,
    type ReceptorExtranjero,
} from '../src/core/dte/tipos.ts';
import { calcularTotalesExportacion } from '../src/core/dte/totales.ts';
import { serialize, XML_DECLARATION } from '../src/core/xml/serialize.ts';
import { generarCafFalso } from './support/caf-falso.ts';
import { generarCertificadoFalso } from './support/certificado-falso.ts';
import { EMISION, EMISOR, FIRMADO, TIMBRADO } from './support/emitir.ts';

function emitirExportacion(documento: DocumentoExportacion) {
    const caf = parseCaf(generarCafFalso({ rutEmisor: EMISOR.rut, tipoDte: documento.tipo, folioHasta: 1000 }));
    const { p12, clave } = generarCertificadoFalso();
    const certificado = cargarCertificado(p12, clave);

    const totales = calcularTotalesExportacion(documento);
    const ted = timbrar(datosTimbreExportacion(documento, totales), caf, TIMBRADO);
    const firmado = firmarDocumento(
        envolverDte(agregarTimbre(construirExportacion(documento, totales), ted, FIRMADO)),
        idDocumento(documento.tipo, documento.folio),
        certificado
    );

    return { caf, ted, totales, xml: XML_DECLARATION + serialize(firmado) };
}

const CLIENTE: ReceptorExtranjero = {
    razonSocial: 'ANDES BAKERY LLC',
    giro: 'Food distribution',
    direccion: '1200 Brickell Ave',
    ciudad: 'Miami',
    numeroIdentificacion: '84-1234567',
    nacionalidad: 225,
};

const BASE = { folio: 3, fechaEmision: EMISION, emisor: EMISOR, receptor: CLIENTE } as const;

describe('factura de exportacion (110)', () => {
    it('pasa el esquema y el timbre valida', () => {
        const factura: FacturaExportacion = {
            ...BASE,
            tipo: TIPO_EXPORTACION.FACTURA,
            moneda: 'DOLAR USA',
            items: [{ nombre: 'Pan congelado', cantidad: 1200, precioUnitario: 1.85 }],
        };
        const emitida = emitirExportacion(factura);

        validarContraEsquema(emitida.xml, 'DTE_v10.xsd');
        ok(verificarTimbre(emitida.ted, emitida.caf));
    });

    it('conserva los centavos de la moneda extranjera', () => {
        const factura: FacturaExportacion = {
            ...BASE,
            tipo: TIPO_EXPORTACION.FACTURA,
            moneda: 'EURO',
            items: [
                { nombre: 'Masa madre', cantidad: 3, precioUnitario: 12.3456 },
                { nombre: 'Levadura', cantidad: 7, precioUnitario: 0.99 },
            ],
        };
        const { totales, xml } = emitirExportacion(factura);

        // 37.0368 + 6.93, sin redondear a entero.
        strictEqual(totales.total, 43.9668);
        ok(xml.includes('<TpoMoneda>EURO</TpoMoneda>'));
        ok(xml.includes('<MntTotal>43.9668</MntTotal>'));
        validarContraEsquema(xml, 'DTE_v10.xsd');
    });

    it('todo es exento: no hay neto ni IVA', () => {
        const { xml } = emitirExportacion({
            ...BASE,
            tipo: TIPO_EXPORTACION.FACTURA,
            moneda: 'DOLAR USA',
            items: [{ nombre: 'Asesoria', monto: 5000 }],
        });

        ok(!xml.includes('<MntNeto>'));
        ok(!xml.includes('<IVA>'));
        ok(xml.includes('<MntExe>5000</MntExe>'));
    });

    it('identifica al receptor extranjero sin RUT chileno', () => {
        const { xml } = emitirExportacion({
            ...BASE,
            tipo: TIPO_EXPORTACION.FACTURA,
            moneda: 'DOLAR USA',
            items: [{ nombre: 'X', monto: 100 }],
        });

        ok(xml.includes(`<RUTRecep>${RUT_EXTRANJERO}</RUTRecep>`));
        ok(xml.includes('<Extranjero><NumId>84-1234567</NumId><Nacionalidad>225</Nacionalidad></Extranjero>'));
    });

    it('lleva el bloque de aduana', () => {
        const factura: FacturaExportacion = {
            ...BASE,
            tipo: TIPO_EXPORTACION.FACTURA,
            moneda: 'DOLAR USA',
            formaPago: 'credito',
            items: [{ nombre: 'Pan congelado', cantidad: 1200, precioUnitario: 1.85 }],
            aduana: {
                modalidadVenta: 1,
                clausulaVenta: 5,
                totalClausulaVenta: 2220,
                viaTransporte: 1,
                nombreTransporte: 'MSC ANTONIA',
                puertoEmbarque: 906,
                puertoDesembarque: 262,
                pesoBruto: 1450.5,
                unidadPesoBruto: 6,
                totalBultos: 40,
                bultos: [{ tipo: 75, cantidad: 40, marcas: 'ANDES-01' }],
                flete: 310.25,
                seguro: 22.2,
                paisReceptor: 225,
                paisDestino: 225,
            },
        };
        const { xml } = emitirExportacion(factura);

        validarContraEsquema(xml, 'DTE_v10.xsd');
        ok(xml.includes('<CodClauVenta>5</CodClauVenta>'));
        ok(xml.includes('<TipoBultos><CodTpoBultos>75</CodTpoBultos>'));
    });
});

describe('notas de exportacion (111 y 112)', () => {
    it('una nota de credito de exportacion referencia la factura 110', () => {
        const nota: NotaCreditoExportacion = {
            ...BASE,
            tipo: TIPO_EXPORTACION.NOTA_CREDITO,
            moneda: 'DOLAR USA',
            items: [{ nombre: 'Devolucion parcial', cantidad: 100, precioUnitario: 1.85 }],
            referencias: [
                { tipoDocumento: TIPO_EXPORTACION.FACTURA, folio: 3, fecha: EMISION, codigo: 'corrige_montos', razon: 'Producto dañado' },
            ],
        };
        const emitida = emitirExportacion(nota);

        validarContraEsquema(emitida.xml, 'DTE_v10.xsd');
        ok(emitida.xml.includes('<TpoDocRef>110</TpoDocRef>'));
    });

    it('una nota de debito de exportacion cobra un ajuste', () => {
        const emitida = emitirExportacion({
            ...BASE,
            tipo: TIPO_EXPORTACION.NOTA_DEBITO,
            moneda: 'DOLAR USA',
            items: [{ nombre: 'Ajuste de flete', monto: 45.5 }],
            referencias: [{ tipoDocumento: TIPO_EXPORTACION.FACTURA, folio: 3, fecha: EMISION, codigo: 'corrige_montos' }],
        });

        validarContraEsquema(emitida.xml, 'DTE_v10.xsd');
    });
});
