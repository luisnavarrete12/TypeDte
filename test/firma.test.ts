import { ok, strictEqual, throws } from 'node:assert/strict';
import { describe, it } from 'node:test';

import { cargarCertificado, CertificadoError, estaVigente } from '../src/adapters/crypto/certificado.ts';
import { firmarDocumento, verificarFirma } from '../src/adapters/firma/firmar.ts';
import { el, fields } from '../src/core/xml/node.ts';
import { serialize } from '../src/core/xml/serialize.ts';
import { generarCertificadoFalso } from './support/certificado-falso.ts';

const NS = 'http://www.sii.cl/SiiDte';

function documentoDePrueba() {
    return el('DTE', { xmlns: NS, version: '1.0' }, [
        el('Documento', { ID: 'F1T33' }, [
            fields('Encabezado', [
                ['TipoDTE', 33],
                ['Folio', 1],
                ['RznSoc', 'PANADERÍA ÑUÑOA LTDA'],
            ]),
        ]),
    ]);
}

describe('certificado digital', () => {
    it('lee la llave, el certificado y los datos del titular', () => {
        const { p12, clave } = generarCertificadoFalso({ rut: '99999999-9' });
        const certificado = cargarCertificado(p12, clave);

        strictEqual(certificado.rut, '99999999-9');
        strictEqual(certificado.emailTitular, 'juan@correo.example');
        ok(certificado.llavePrivadaPem.includes('PRIVATE KEY'));
        ok(certificado.certificadoBase64.length > 100);
        ok(!certificado.certificadoBase64.includes('BEGIN'));
    });

    it('avisa cuando la clave esta mala en vez de fallar en otro lado', () => {
        const { p12 } = generarCertificadoFalso({ clave: 'correcta' });

        throws(() => cargarCertificado(p12, 'incorrecta'), CertificadoError);
    });

    it('avisa cuando el archivo no es un .p12', () => {
        throws(() => cargarCertificado(Buffer.from('esto no es un certificado'), 'x'), CertificadoError);
    });

    it('sabe si esta vigente', () => {
        const { p12, clave } = generarCertificadoFalso({ vencido: true });
        const certificado = cargarCertificado(p12, clave);

        ok(!estaVigente(certificado, new Date('2026-09-16')));
        ok(estaVigente(certificado, new Date('2026-01-15')));
    });
});

describe('firma del documento (XMLDSig)', () => {
    it('firma y la firma valida', () => {
        const { p12, clave } = generarCertificadoFalso();
        const certificado = cargarCertificado(p12, clave);
        const firmado = firmarDocumento(documentoDePrueba(), 'F1T33', certificado);

        ok(verificarFirma(firmado, 'F1T33', certificado));
    });

    it('arma la estructura que espera el SII', () => {
        const { p12, clave } = generarCertificadoFalso();
        const certificado = cargarCertificado(p12, clave);
        const xml = serialize(firmarDocumento(documentoDePrueba(), 'F1T33', certificado));

        ok(xml.includes('<Signature xmlns="http://www.w3.org/2000/09/xmldsig#">'));
        ok(xml.includes('<Reference URI="#F1T33">'));
        ok(xml.includes('Algorithm="http://www.w3.org/2000/09/xmldsig#rsa-sha1"'));
        ok(xml.includes('<X509Certificate>'));
    });

    it('detecta si alguien cambia el documento despues de firmar', () => {
        const { p12, clave } = generarCertificadoFalso();
        const certificado = cargarCertificado(p12, clave);
        const firmado = firmarDocumento(documentoDePrueba(), 'F1T33', certificado);

        const adulterado = JSON.parse(
            JSON.stringify(firmado).replace('"1"', '"999"')
        ) as typeof firmado;

        ok(!verificarFirma(adulterado, 'F1T33', certificado));
    });

    it('no valida con el certificado de otro', () => {
        const propio = cargarCertificado(...desestructurar(generarCertificadoFalso()));
        const ajeno = cargarCertificado(...desestructurar(generarCertificadoFalso()));
        const firmado = firmarDocumento(documentoDePrueba(), 'F1T33', propio);

        ok(!verificarFirma(firmado, 'F1T33', ajeno));
    });

    it('reclama si el ID referenciado no existe', () => {
        const { p12, clave } = generarCertificadoFalso();
        const certificado = cargarCertificado(p12, clave);

        throws(() => firmarDocumento(documentoDePrueba(), 'NOEXISTE', certificado));
    });
});

function desestructurar({ p12, clave }: { p12: Buffer; clave: string }): [Buffer, string] {
    return [p12, clave];
}
