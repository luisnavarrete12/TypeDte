import { XmlC14NMode, XmlDocument } from 'libxml2-wasm';

/**
 * Canonicalizacion C14N sobre el arbol, no sobre el texto.
 *
 * La firma se calcula sobre el resultado de esto. Hacerlo con expresiones
 * regulares sobre el string serializado funciona hasta que aparece un namespace
 * o un atributo en otro orden, y ahi se termina firmando algo distinto a lo
 * que se envia.
 *
 * Se usa C14N inclusiva (1.0), que es la que espera el SII.
 */
export function canonicalizar(xml: string, xpath?: string): string {
    const doc = XmlDocument.fromString(xml);

    try {
        const nodo = xpath === undefined ? doc.root : doc.get(xpath);

        if (nodo === null || nodo === undefined) {
            throw new Error(`No se encontro el nodo a canonicalizar: ${xpath ?? '/'}`);
        }

        // C14N siempre emite UTF-8, y libxml2-wasm lo entrega como un string
        // donde cada caracter es un byte. Hay que reinterpretarlo o el texto
        // con acentos queda partido, se firma eso, y el SII rechaza sin decir
        // por que.
        const bytesUtf8 = nodo.canonicalizeToString({ mode: XmlC14NMode.XML_C14N_1_0 });

        return Buffer.from(bytesUtf8, 'latin1').toString('utf8');
    } finally {
        doc.dispose();
    }
}

/**
 * Canonicaliza y quita el espacio en blanco que separa tags.
 *
 * El SII firma el timbre sobre la version aplanada. Solo se toca el espacio
 * entre `>` y `<`; el que va dentro de un texto es contenido y se respeta.
 */
export function canonicalizarAplanado(xml: string, xpath?: string): string {
    return canonicalizar(xml, xpath).replace(/>\s+</g, '><').trim();
}
