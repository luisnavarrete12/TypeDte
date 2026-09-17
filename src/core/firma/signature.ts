import { el, type XmlElement } from '../xml/node.ts';

export const NS_XMLDSIG = 'http://www.w3.org/2000/09/xmldsig#';

const C14N_INCLUSIVA = 'http://www.w3.org/TR/2001/REC-xml-c14n-20010315';
const RSA_SHA1 = `${NS_XMLDSIG}rsa-sha1`;
const SHA1 = `${NS_XMLDSIG}sha1`;
const FIRMA_ENVOLVENTE = `${NS_XMLDSIG}enveloped-signature`;

export interface DatosFirma {
    /**
     * Nodo firmado. `null` significa el documento entero, que es lo que el
     * SII espera al pedir el token: ahi la referencia va vacia (`URI=""`).
     */
    readonly referenciaId: string | null;
    readonly digestBase64: string;
    readonly modulo: string;
    readonly exponente: string;
    readonly certificadoBase64: string;
}

/**
 * Arma el nodo `SignedInfo`, que es lo que efectivamente se firma.
 *
 * Es el unico trozo que entra al calculo de la firma: describe que se firmo
 * (la referencia), con que algoritmo, y el resumen del contenido. El resto de
 * la estructura solo acompania.
 */
export function construirSignedInfo(datos: DatosFirma): XmlElement {
    return el('SignedInfo', { xmlns: NS_XMLDSIG }, [
        el('CanonicalizationMethod', { Algorithm: C14N_INCLUSIVA }),
        el('SignatureMethod', { Algorithm: RSA_SHA1 }),
        el('Reference', { URI: datos.referenciaId === null ? '' : `#${datos.referenciaId}` }, [
            el('Transforms', undefined, [el('Transform', { Algorithm: FIRMA_ENVOLVENTE })]),
            el('DigestMethod', { Algorithm: SHA1 }),
            el('DigestValue', undefined, [datos.digestBase64]),
        ]),
    ]);
}

export function construirSignature(
    datos: DatosFirma,
    signedInfo: XmlElement,
    firmaBase64: string
): XmlElement {
    return el('Signature', { xmlns: NS_XMLDSIG }, [
        signedInfo,
        el('SignatureValue', undefined, [firmaBase64]),
        el('KeyInfo', undefined, [
            el('KeyValue', undefined, [
                el('RSAKeyValue', undefined, [
                    el('Modulus', undefined, [datos.modulo]),
                    el('Exponent', undefined, [datos.exponente]),
                ]),
            ]),
            el('X509Data', undefined, [
                el('X509Certificate', undefined, [datos.certificadoBase64]),
            ]),
        ]),
    ]);
}
