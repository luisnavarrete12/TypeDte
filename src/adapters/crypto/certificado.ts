import forge from 'node-forge';

/**
 * Certificado digital del contribuyente, leido desde un archivo .p12/.pfx.
 */
export interface Certificado {
    readonly llavePrivadaPem: string;
    readonly llavePublicaPem: string;
    /** El certificado en base64, sin cabeceras PEM, como va en el XML. */
    readonly certificadoBase64: string;
    readonly rut: string | null;
    readonly nombre: string | null;
    readonly emailTitular: string | null;
    readonly validoDesde: Date;
    readonly validoHasta: Date;
    readonly modulo: string;
    readonly exponente: string;
}

export class CertificadoError extends Error {
    constructor(mensaje: string) {
        super(mensaje);
        this.name = 'CertificadoError';
    }
}

/**
 * Abre el certificado con node-forge y no con el modulo crypto de Node.
 *
 * Los certificados que emiten los proveedores chilenos vienen cifrados con
 * algoritmos que OpenSSL 3 marca como legacy y se niega a abrir. Forge los
 * descifra en JavaScript puro, sin depender de lo que traiga el sistema.
 */
export function cargarCertificado(p12: Buffer, clave: string): Certificado {
    const asn1 = leerAsn1(p12);
    const bolsa = abrirP12(asn1, clave);

    const certificado = primerCertificado(bolsa);
    const llavePrivada = primeraLlavePrivada(bolsa);

    return {
        llavePrivadaPem: forge.pki.privateKeyToPem(llavePrivada).trim(),
        llavePublicaPem: forge.pki.publicKeyToPem(certificado.publicKey).trim(),
        certificadoBase64: derBase64(certificado),
        rut: extraerRut(certificado),
        nombre: atributo(certificado, 'commonName'),
        emailTitular: extraerEmail(certificado),
        validoDesde: certificado.validity.notBefore,
        validoHasta: certificado.validity.notAfter,
        ...componentesRsa(certificado),
    };
}

export function estaVigente(certificado: Certificado, momento: Date = new Date()): boolean {
    return momento >= certificado.validoDesde && momento <= certificado.validoHasta;
}

function leerAsn1(p12: Buffer): forge.asn1.Asn1 {
    try {
        return forge.asn1.fromDer(forge.util.createBuffer(p12.toString('binary')));
    } catch (error) {
        throw new CertificadoError(
            `El archivo no parece un .p12 valido: ${(error as Error).message}`
        );
    }
}

function abrirP12(asn1: forge.asn1.Asn1, clave: string): forge.pkcs12.Pkcs12Pfx {
    try {
        return forge.pkcs12.pkcs12FromAsn1(asn1, false, clave);
    } catch (error) {
        throw new CertificadoError(
            `No se pudo abrir el certificado, probablemente la clave es incorrecta: ${(error as Error).message}`
        );
    }
}

// OIDs de PKCS#12. Van explicitos porque los que expone forge estan tipados
// como opcionales y aca no lo son.
const BOLSA_CERTIFICADO = '1.2.840.113549.1.12.10.1.3';
const BOLSA_LLAVE_CIFRADA = '1.2.840.113549.1.12.10.1.2';
const BOLSA_LLAVE = '1.2.840.113549.1.12.10.1.1';

function primerCertificado(bolsa: forge.pkcs12.Pkcs12Pfx): forge.pki.Certificate {
    const bolsas = bolsa.getBags({ bagType: BOLSA_CERTIFICADO })[BOLSA_CERTIFICADO];
    const certificado = bolsas?.[0]?.cert;

    if (!certificado) {
        throw new CertificadoError('El archivo no contiene un certificado.');
    }

    return certificado;
}

function primeraLlavePrivada(bolsa: forge.pkcs12.Pkcs12Pfx): forge.pki.rsa.PrivateKey {
    for (const tipo of [BOLSA_LLAVE_CIFRADA, BOLSA_LLAVE]) {
        const llave = bolsa.getBags({ bagType: tipo })[tipo]?.[0]?.key;

        if (llave) {
            return llave as forge.pki.rsa.PrivateKey;
        }
    }

    throw new CertificadoError('El archivo no contiene la llave privada.');
}

function derBase64(certificado: forge.pki.Certificate): string {
    const der = forge.asn1.toDer(forge.pki.certificateToAsn1(certificado)).getBytes();

    return forge.util.encode64(der);
}

function componentesRsa(certificado: forge.pki.Certificate): {
    modulo: string;
    exponente: string;
} {
    const publica = certificado.publicKey as forge.pki.rsa.PublicKey;

    return {
        modulo: base64DeEntero(publica.n),
        exponente: base64DeEntero(publica.e),
    };
}

function base64DeEntero(entero: forge.jsbn.BigInteger): string {
    const hex = entero.toString(16);
    const par = hex.length % 2 === 0 ? hex : `0${hex}`;

    return Buffer.from(par, 'hex').toString('base64');
}

/**
 * Se busca por `name` y no por el string suelto: forge interpreta un string
 * como abreviatura (CN, E), y `serialNumber` -donde va el RUT- no tiene.
 */
function atributo(certificado: forge.pki.Certificate, nombre: string): string | null {
    const campo = certificado.subject.getField({ name: nombre }) as { value?: string } | null;

    return campo?.value ?? null;
}

/**
 * El RUT del titular viaja como `serialNumber` del sujeto. Es el dato con el
 * que el SII decide si esta persona puede actuar por la empresa.
 */
function extraerRut(certificado: forge.pki.Certificate): string | null {
    return atributo(certificado, 'serialNumber');
}

function extraerEmail(certificado: forge.pki.Certificate): string | null {
    const directo = atributo(certificado, 'emailAddress');

    if (directo !== null) {
        return directo;
    }

    const alternativo = certificado.getExtension('subjectAltName') as
        | { altNames?: { type: number; value: string }[] }
        | undefined;

    return alternativo?.altNames?.find((n) => n.type === 1)?.value ?? null;
}
