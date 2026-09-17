import { ok, strictEqual } from 'node:assert/strict';
import { describe, it } from 'node:test';

import { parseCaf } from '../src/adapters/caf/parse.ts';
import { cargarCertificado } from '../src/adapters/crypto/certificado.ts';
import { firmarDocumento } from '../src/adapters/firma/firmar.ts';
import { validarContraEsquema } from '../src/adapters/schema/validar.ts';
import { timbrar, verificarTimbre } from '../src/adapters/ted/timbrar.ts';
import {
    construirBoleta,
    construirEnvioBoleta,
    datosTimbreBoleta,
    ID_SET_BOLETA,
    RUT_CONSUMIDOR_FINAL,
} from '../src/core/dte/boleta.ts';
import { agregarTimbre, envolverDte, idDocumento } from '../src/core/dte/documento.ts';
import { RUT_SII } from '../src/core/dte/envio.ts';
import { TIPO_BOLETA, type Boleta, type BoletaAfecta, type BoletaExenta } from '../src/core/dte/tipos.ts';
import { calcularTotalesBoleta } from '../src/core/dte/totales.ts';
import { serialize, XML_DECLARATION } from '../src/core/xml/serialize.ts';
import { generarCafFalso } from './support/caf-falso.ts';
import { generarCertificadoFalso } from './support/certificado-falso.ts';
import { EMISION, EMISOR, FIRMADO, TIMBRADO } from './support/emitir.ts';

/** Una boleta solo se puede validar dentro de su sobre: el esquema no tiene otra raiz. */
function emitirBoleta(boleta: Boleta) {
    const caf = parseCaf(generarCafFalso({ rutEmisor: EMISOR.rut, tipoDte: boleta.tipo, folioHasta: 1000 }));
    const { p12, clave } = generarCertificadoFalso();
    const certificado = cargarCertificado(p12, clave);

    const totales = calcularTotalesBoleta(boleta);
    const ted = timbrar(datosTimbreBoleta(boleta, totales), caf, TIMBRADO);
    const dte = firmarDocumento(
        envolverDte(agregarTimbre(construirBoleta(boleta, totales), ted, FIRMADO)),
        idDocumento(boleta.tipo, boleta.folio),
        certificado
    );
    const sobre = construirEnvioBoleta(
        {
            rutEmisor: EMISOR.rut,
            rutEnvia: '11111111-1',
            rutReceptor: RUT_SII,
            fechaResolucion: '2026-01-01',
            numeroResolucion: 0,
            timestampFirma: '2026-09-16T10:30:10',
        },
        [dte]
    );
    const xml = XML_DECLARATION + serialize(firmarDocumento(sobre, ID_SET_BOLETA, certificado));

    return { caf, ted, totales, xml };
}

const BASE = { folio: 12, fechaEmision: EMISION, emisor: EMISOR } as const;

describe('boleta afecta (39)', () => {
    it('pasa el esquema de boletas y el timbre valida', () => {
        const boleta: BoletaAfecta = {
            ...BASE,
            tipo: TIPO_BOLETA.AFECTA,
            items: [{ nombre: 'Marraqueta', cantidad: 2, precioUnitario: 1190 }],
        };
        const emitida = emitirBoleta(boleta);

        validarContraEsquema(emitida.xml, 'EnvioBOLETA_v11.xsd');
        ok(verificarTimbre(emitida.ted, emitida.caf));
    });

    it('desglosa el IVA hacia atras desde el precio con IVA', () => {
        const boleta: BoletaAfecta = {
            ...BASE,
            tipo: TIPO_BOLETA.AFECTA,
            items: [{ nombre: 'Torta', monto: 11900 }],
        };
        const totales = calcularTotalesBoleta(boleta);

        strictEqual(totales.total, 11900);
        strictEqual(totales.neto, 10000);
        strictEqual(totales.iva, 1900);
    });

    it('neto mas IVA suma exacto el total, incluso con precios que no dividen justo', () => {
        for (const monto of [1000, 1234, 999, 1, 7777, 150990]) {
            const totales = calcularTotalesBoleta({ ...BASE, tipo: TIPO_BOLETA.AFECTA, items: [{ nombre: 'X', monto }] });

            strictEqual(totales.neto + totales.iva, monto, `se perdio un peso con ${monto}`);
        }
    });

    it('sin receptor usa el RUT de consumidor final', () => {
        const emitida = emitirBoleta({ ...BASE, tipo: TIPO_BOLETA.AFECTA, items: [{ nombre: 'Pan', monto: 500 }] });

        ok(emitida.xml.includes(`<RUTRecep>${RUT_CONSUMIDOR_FINAL}</RUTRecep>`));
        ok(emitida.xml.includes(`<RR>${RUT_CONSUMIDOR_FINAL}</RR>`));
    });

    it('usa los nombres de campo propios de la boleta, no los de la factura', () => {
        const { xml } = emitirBoleta({ ...BASE, tipo: TIPO_BOLETA.AFECTA, items: [{ nombre: 'Pan', monto: 500 }] });

        ok(xml.includes('<RznSocEmisor>'));
        ok(!xml.includes('<RznSoc>'), 'uso el nombre de campo de factura');
        ok(!xml.includes('<TasaIVA>'), 'la boleta no lleva tasa');
        ok(xml.includes('<IndServicio>3</IndServicio>'));
    });

    it('acepta un receptor identificado y referencias internas', () => {
        const boleta: BoletaAfecta = {
            ...BASE,
            tipo: TIPO_BOLETA.AFECTA,
            receptor: { rut: '12345678-5', razonSocial: 'Juan Pérez' },
            items: [{ nombre: 'Kuchen', monto: 8990 }],
            referencias: [{ codigo: 'CAJA-2', razon: 'Venta mesón', codigoCaja: '2' }],
        };
        const emitida = emitirBoleta(boleta);

        validarContraEsquema(emitida.xml, 'EnvioBOLETA_v11.xsd');
        ok(emitida.xml.includes('<RSR>Juan Pérez</RSR>'));
    });

    it('aplica descuento global sobre el precio con IVA', () => {
        const boleta: BoletaAfecta = {
            ...BASE,
            tipo: TIPO_BOLETA.AFECTA,
            items: [{ nombre: 'Pan', monto: 10000 }],
            movimientosGlobales: [{ tipo: 'descuento', porcentaje: 10, glosa: 'Promo' }],
        };
        const emitida = emitirBoleta(boleta);

        validarContraEsquema(emitida.xml, 'EnvioBOLETA_v11.xsd');
        strictEqual(emitida.totales.total, 9000);
    });
});

describe('boleta exenta (41)', () => {
    it('no lleva neto ni IVA', () => {
        const boleta: BoletaExenta = {
            ...BASE,
            tipo: TIPO_BOLETA.EXENTA,
            items: [{ nombre: 'Entrada museo', cantidad: 3, precioUnitario: 2000 }],
        };
        const emitida = emitirBoleta(boleta);

        validarContraEsquema(emitida.xml, 'EnvioBOLETA_v11.xsd');
        ok(!emitida.xml.includes('<MntNeto>'));
        ok(!emitida.xml.includes('<IVA>'));
        ok(emitida.xml.includes('<MntExe>6000</MntExe>'));
        strictEqual(emitida.totales.total, 6000);
    });
});
