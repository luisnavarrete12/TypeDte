import { generateKeyPairSync } from 'node:crypto';
import forge from 'node-forge';

export interface OpcionesCertificadoFalso {
    readonly rut?: string;
    readonly nombre?: string;
    readonly email?: string;
    readonly clave?: string;
    readonly vencido?: boolean;
}

/**
 * Genera un .p12 autofirmado con la misma forma que el certificado real:
 * el RUT del titular en `serialNumber` y el correo en el sujeto.
 *
 * La llave se crea con node:crypto porque generarla en JavaScript puro se
 * demora segundos y esto corre en cada test.
 */
export function generarCertificadoFalso(opciones: OpcionesCertificadoFalso = {}): {
    p12: Buffer;
    clave: string;
} {
    const clave = opciones.clave ?? 'secreto';
    const par = generateKeyPairSync('rsa', { modulusLength: 1024 });

    const privada = forge.pki.privateKeyFromPem(
        par.privateKey.export({ type: 'pkcs1', format: 'pem' }).toString()
    );
    const publica = forge.pki.publicKeyFromPem(
        par.publicKey.export({ type: 'spki', format: 'pem' }).toString()
    );

    const certificado = forge.pki.createCertificate();
    certificado.publicKey = publica;
    certificado.serialNumber = '01';
    certificado.validity.notBefore = new Date('2026-01-01T00:00:00Z');
    certificado.validity.notAfter = opciones.vencido
        ? new Date('2026-02-01T00:00:00Z')
        : new Date('2028-01-01T00:00:00Z');

    const sujeto = [
        { name: 'commonName', value: opciones.nombre ?? 'JUAN PEREZ SOTO' },
        { name: 'serialNumber', value: opciones.rut ?? '11111111-1' },
        { name: 'emailAddress', value: opciones.email ?? 'juan@correo.example' },
        { name: 'countryName', value: 'CL' },
    ];

    certificado.setSubject(sujeto);
    certificado.setIssuer(sujeto);
    certificado.sign(privada, forge.md.sha256.create());

    const p12 = forge.pkcs12.toPkcs12Asn1(privada, [certificado], clave, {
        algorithm: '3des',
    });

    return {
        p12: Buffer.from(forge.asn1.toDer(p12).getBytes(), 'binary'),
        clave,
    };
}
