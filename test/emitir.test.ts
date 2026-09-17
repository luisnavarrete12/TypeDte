import { ok, strictEqual, throws } from 'node:assert/strict';
import { describe, it } from 'node:test';

import { parseCaf } from '../src/adapters/caf/parse.ts';
import { cargarCertificado, CertificadoError } from '../src/adapters/crypto/certificado.ts';
import { verificarFirma } from '../src/adapters/firma/firmar.ts';
import { validarContraEsquema } from '../src/adapters/schema/validar.ts';
import { verificarTimbre } from '../src/adapters/ted/timbrar.ts';
import { idDocumento } from '../src/core/dte/documento.ts';
import { CafError } from '../src/core/ted/caf.ts';
import { emitir, type DocumentoEmitible } from '../src/emitir.ts';
import { generarCafFalso } from './support/caf-falso.ts';
import { generarCertificadoFalso } from './support/certificado-falso.ts';
import { EMISION, EMISOR, RECEPTOR } from './support/emitir.ts';

const TIMESTAMP = '2026-09-16T10:30:00';
const certificado = (() => {
    const { p12, clave } = generarCertificadoFalso();
    return cargarCertificado(p12, clave);
})();

function cafPara(tipo: number) {
    return parseCaf(generarCafFalso({ rutEmisor: EMISOR.rut, tipoDte: tipo, folioHasta: 1000 }));
}

const BASE = { folio: 1, fechaEmision: EMISION, emisor: EMISOR } as const;

/** Un documento minimo de cada uno de los 12 tipos, con el esquema contra el que se valida. */
const UNO_DE_CADA: readonly [DocumentoEmitible, string][] = [
    [{ ...BASE, receptor: RECEPTOR, tipo: 33, items: [{ nombre: 'Pan', monto: 1000 }] }, 'DTE_v10.xsd'],
    [{ ...BASE, receptor: RECEPTOR, tipo: 34, items: [{ nombre: 'Curso', monto: 1000 }] }, 'DTE_v10.xsd'],
    [{ ...BASE, receptor: RECEPTOR, tipo: 46, items: [{ nombre: 'Trigo', monto: 1000 }] }, 'DTE_v10.xsd'],
    [{ ...BASE, receptor: RECEPTOR, tipo: 52, indicadorTraslado: 1, items: [{ nombre: 'Pan', monto: 1000 }] }, 'DTE_v10.xsd'],
    [{ ...BASE, receptor: RECEPTOR, tipo: 56, items: [{ nombre: 'Ajuste', monto: 100 }], referencias: [{ tipoDocumento: 33, folio: 1, fecha: EMISION, codigo: 'corrige_montos' }] }, 'DTE_v10.xsd'],
    [{ ...BASE, receptor: RECEPTOR, tipo: 61, items: [{ nombre: 'Devolucion', monto: 100 }], referencias: [{ tipoDocumento: 33, folio: 1, fecha: EMISION, codigo: 'anula' }] }, 'DTE_v10.xsd'],
    [{ ...BASE, receptor: RECEPTOR, tipo: 43, items: [{ nombre: 'Venta', monto: 10000, tipoDocumentoLiquidado: 33 }], comisiones: [{ tipo: 'comision', glosa: 'Comision', neto: 1000 }] }, 'DTE_v10.xsd'],
    [{ ...BASE, receptor: { razonSocial: 'ANDES LLC' }, tipo: 110, moneda: 'DOLAR USA', items: [{ nombre: 'Pan', monto: 10.5 }] }, 'DTE_v10.xsd'],
    [{ ...BASE, receptor: { razonSocial: 'ANDES LLC' }, tipo: 111, moneda: 'DOLAR USA', items: [{ nombre: 'Ajuste', monto: 1 }], referencias: [{ tipoDocumento: 110, folio: 1, fecha: EMISION }] }, 'DTE_v10.xsd'],
    [{ ...BASE, receptor: { razonSocial: 'ANDES LLC' }, tipo: 112, moneda: 'DOLAR USA', items: [{ nombre: 'Devolucion', monto: 1 }], referencias: [{ tipoDocumento: 110, folio: 1, fecha: EMISION }] }, 'DTE_v10.xsd'],
];

describe('emitir en una sola llamada', () => {
    for (const [documento, esquema] of UNO_DE_CADA) {
        it(`tipo ${documento.tipo}: sale timbrado, firmado y valido`, () => {
            const caf = cafPara(documento.tipo);
            const emitido = emitir(documento, { caf, certificado, timestamp: TIMESTAMP });

            validarContraEsquema(emitido.xml, esquema);
            ok(verificarTimbre(emitido.ted, caf), 'timbre');
            ok(verificarFirma(emitido.firmado, idDocumento(documento.tipo, documento.folio), certificado), 'firma');
        });
    }

    it('las boletas tambien salen por la misma llamada', () => {
        const emitido = emitir(
            { ...BASE, tipo: 39, items: [{ nombre: 'Pan', monto: 1190 }] },
            { caf: cafPara(39), certificado, timestamp: TIMESTAMP }
        );

        strictEqual(emitido.totales.iva, 190);
        ok(emitido.xml.includes('<RznSocEmisor>'));
    });

    it('emitir dos veces lo mismo da el mismo documento', () => {
        const [documento] = UNO_DE_CADA[0]!;
        const caf = cafPara(33);

        strictEqual(
            emitir(documento, { caf, certificado, timestamp: TIMESTAMP }).xml,
            emitir(documento, { caf, certificado, timestamp: TIMESTAMP }).xml
        );
    });

    it('no emite con un certificado vencido a la fecha de emision', () => {
        const { p12, clave } = generarCertificadoFalso({ vencido: true });
        const [documento] = UNO_DE_CADA[0]!;

        throws(
            () => emitir(documento, { caf: cafPara(33), certificado: cargarCertificado(p12, clave), timestamp: TIMESTAMP }),
            CertificadoError
        );
    });

    it('no emite con el CAF de otro tipo de documento', () => {
        const [documento] = UNO_DE_CADA[0]!;

        throws(() => emitir(documento, { caf: cafPara(34), certificado, timestamp: TIMESTAMP }), CafError);
    });
});
