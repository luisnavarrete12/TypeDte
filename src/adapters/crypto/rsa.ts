import { createSign, createVerify } from 'node:crypto';

/**
 * El algoritmo del timbre es SHA1withRSA. Esta obsoleto para casi todo, pero
 * es lo que el SII especifica y lo que valida: no es una eleccion nuestra.
 */
const ALGORITMO = 'RSA-SHA1';

/** Firma los bytes en ISO-8859-1, que es sobre lo que el SII valida. */
export function firmarSha1ConRsa(contenido: string, llavePrivadaPem: string): string {
    const firma = createSign(ALGORITMO);
    firma.update(Buffer.from(contenido, 'latin1'));

    return firma.sign(llavePrivadaPem, 'base64');
}

export function verificarSha1ConRsa(
    contenido: string,
    firmaBase64: string,
    llavePublicaPem: string
): boolean {
    const verificador = createVerify(ALGORITMO);
    verificador.update(Buffer.from(contenido, 'latin1'));

    return verificador.verify(llavePublicaPem, firmaBase64, 'base64');
}
