import { createHash } from 'node:crypto';

import type { Certificado } from '../crypto/certificado.ts';
import { firmarSha1ConRsa, verificarSha1ConRsa } from '../crypto/rsa.ts';
import { canonicalizar } from '../xml/canonical.ts';
import { construirSignature, construirSignedInfo } from '../../core/firma/signature.ts';
import { serialize, XML_DECLARATION } from '../../core/xml/serialize.ts';
import { el, type XmlElement } from '../../core/xml/node.ts';

export class FirmaError extends Error {
    constructor(mensaje: string) {
        super(mensaje);
        this.name = 'FirmaError';
    }
}

/**
 * Firma un documento con el certificado del contribuyente (XMLDSig).
 *
 * Son dos calculos encadenados y en este orden:
 *   1. el resumen del nodo referenciado, que se guarda en `DigestValue`;
 *   2. la firma sobre `SignedInfo`, que ya contiene ese resumen.
 *
 * Por eso no se puede tocar nada del documento despues de firmar: cualquier
 * cambio invalida el resumen, y con el, la firma.
 */
export function firmarDocumento(
    documento: XmlElement,
    referenciaId: string | null,
    certificado: Certificado
): XmlElement {
    const referencia = canonicalizarReferencia(documento, referenciaId);

    const datos = {
        referenciaId,
        digestBase64: sha1Base64(referencia),
        modulo: certificado.modulo,
        exponente: certificado.exponente,
        certificadoBase64: certificado.certificadoBase64,
    };

    const signedInfo = construirSignedInfo(datos);
    const firma = firmarSha1ConRsa(
        canonicalizarSignedInfo(signedInfo),
        certificado.llavePrivadaPem
    );

    return agregarHijo(documento, construirSignature(datos, signedInfo, firma));
}

/** Rehace ambos calculos y los compara, sin llamar al SII. */
export function verificarFirma(
    documentoFirmado: XmlElement,
    referenciaId: string | null,
    certificado: Certificado
): boolean {
    const signature = hijo(documentoFirmado, 'Signature');

    if (signature === undefined) {
        return false;
    }

    const signedInfo = hijo(signature, 'SignedInfo');
    const valor = texto(hijo(signature, 'SignatureValue'));

    if (signedInfo === undefined || valor === undefined) {
        return false;
    }

    const sinFirma = el(documentoFirmado.name, documentoFirmado.attrs, [
        ...(documentoFirmado.children ?? []).filter((c) => c !== signature),
    ]);
    if (sha1Base64(canonicalizarReferencia(sinFirma, referenciaId)) !== digestDeclarado(signedInfo)) {
        return false;
    }

    return verificarSha1ConRsa(
        canonicalizarSignedInfo(signedInfo),
        valor,
        certificado.llavePublicaPem
    );
}

/**
 * Canonicaliza lo que la firma protege: un nodo con ese ID, o el documento
 * completo cuando la referencia va vacia.
 */
function canonicalizarReferencia(documento: XmlElement, referenciaId: string | null): string {
    const xml = XML_DECLARATION + serialize(documento);

    if (referenciaId === null) {
        return canonicalizar(xml);
    }

    const referencia = canonicalizar(xml, `//*[@ID='${referenciaId}']`);

    if (referencia === '') {
        throw new FirmaError(`El documento no tiene un nodo con ID="${referenciaId}".`);
    }

    return referencia;
}

function canonicalizarSignedInfo(signedInfo: XmlElement): string {
    return canonicalizar(XML_DECLARATION + serialize(signedInfo));
}

function sha1Base64(contenido: string): string {
    return createHash('sha1').update(Buffer.from(contenido, 'latin1')).digest('base64');
}

function digestDeclarado(signedInfo: XmlElement): string | undefined {
    const referencia = hijo(signedInfo, 'Reference');

    return referencia === undefined ? undefined : texto(hijo(referencia, 'DigestValue'));
}

function hijo(elemento: XmlElement, nombre: string): XmlElement | undefined {
    return (elemento.children ?? []).find(
        (c): c is XmlElement => typeof c === 'object' && 'name' in c && c.name === nombre
    );
}

function texto(elemento: XmlElement | undefined): string | undefined {
    const valor = elemento?.children?.[0];

    return typeof valor === 'string' ? valor : undefined;
}

function agregarHijo(elemento: XmlElement, nuevo: XmlElement): XmlElement {
    return el(elemento.name, elemento.attrs, [...(elemento.children ?? []), nuevo]);
}
