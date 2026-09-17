import { createSign, generateKeyPairSync } from 'node:crypto';

import { canonicalizarAplanado } from '../../src/adapters/xml/canonical.ts';

export interface OpcionesCafFalso {
    readonly rutEmisor?: string;
    readonly razonSocial?: string;
    readonly tipoDte?: number;
    readonly folioDesde?: number;
    readonly folioHasta?: number;
}

/**
 * Genera un CAF con la misma forma que entrega el SII, firmado por una llave
 * inventada que hace de SII.
 *
 * Sirve para probar el timbre completo sin gastar folios reales: la estructura
 * y el algoritmo son los mismos, solo cambia quien firmo.
 */
export function generarCafFalso(opciones: OpcionesCafFalso = {}): string {
    const rutEmisor = opciones.rutEmisor ?? '44444444-4';
    const razonSocial = opciones.razonSocial ?? 'PANADERIA NUNOA SPA';
    const tipoDte = opciones.tipoDte ?? 33;
    const folioDesde = opciones.folioDesde ?? 1;
    const folioHasta = opciones.folioHasta ?? 100;

    const emisor = generateKeyPairSync('rsa', { modulusLength: 1024 });
    const sii = generateKeyPairSync('rsa', { modulusLength: 1024 });

    const jwk = emisor.publicKey.export({ format: 'jwk' });
    const modulo = base64Desde(jwk.n!);
    const exponente = base64Desde(jwk.e!);

    const da =
        `<DA>` +
        `<RE>${rutEmisor}</RE>` +
        `<RS>${razonSocial}</RS>` +
        `<TD>${tipoDte}</TD>` +
        `<RNG><D>${folioDesde}</D><H>${folioHasta}</H></RNG>` +
        `<FA>2026-09-01</FA>` +
        `<RSAPK><M>${modulo}</M><E>${exponente}</E></RSAPK>` +
        `<IDK>100</IDK>` +
        `</DA>`;

    const firmaDelSii = firmar(canonicalizarAplanado(`<CAF version="1.0">${da}</CAF>`, '//DA'), sii.privateKey);

    const caf =
        `<CAF version="1.0">${da}<FRMA algoritmo="SHA1withRSA">${firmaDelSii}</FRMA></CAF>`;

    return (
        `<?xml version="1.0" encoding="ISO-8859-1"?>` +
        `<AUTORIZACION>` +
        caf +
        `<RSASK>${pem(emisor.privateKey.export({ type: 'pkcs1', format: 'pem' }))}</RSASK>` +
        `<RSAPUBK>${pem(emisor.publicKey.export({ type: 'spki', format: 'pem' }))}</RSAPUBK>` +
        `</AUTORIZACION>`
    );
}

function firmar(contenido: string, llave: ReturnType<typeof generateKeyPairSync>['privateKey']): string {
    const firma = createSign('RSA-SHA1');
    firma.update(Buffer.from(contenido, 'latin1'));

    return firma.sign(llave, 'base64');
}

function base64Desde(base64url: string): string {
    return Buffer.from(base64url, 'base64url').toString('base64');
}

function pem(exportado: string | Buffer): string {
    return exportado.toString().trim();
}
