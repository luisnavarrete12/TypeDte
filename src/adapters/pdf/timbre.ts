import { readBarcodes } from 'zxing-wasm/reader';
import { writeBarcode } from 'zxing-wasm/writer';

import type { XmlElement } from '../../core/xml/node.ts';
import { serialize } from '../../core/xml/serialize.ts';

/**
 * El SII exige el nivel 5 de correccion de errores: el timbre tiene que poder
 * leerse aunque el papel termico este gastado o doblado.
 */
const NIVEL_CORRECCION = 5;

/**
 * Dibuja el timbre electronico como codigo PDF417.
 *
 * Lo que va adentro son los bytes del `<TED>` en ISO-8859-1, no un string: un
 * fiscalizador escanea el papel y tiene que obtener exactamente el XML que se
 * firmo. Por eso se le pasan bytes al codificador, y por eso se eligio uno que
 * se verifico leyendo de vuelta, acentos incluidos.
 *
 * `columnas` cambia la forma del simbolo: mas columnas lo dejan mas ancho y
 * mas bajo, util en un ticket angosto, pero tambien hace mas finos sus
 * modulos. Una impresora termica de 203 dpi puede no resolverlos, asi que
 * conviene probar el resultado en la impresora real antes de bajarlo mucho.
 */
export async function dibujarTimbre(ted: XmlElement, columnas?: number): Promise<Uint8Array> {
    const resultado = await writeBarcode(bytesDelTimbre(ted), {
        format: 'PDF417',
        options: `eclevel=${NIVEL_CORRECCION}` + (columnas === undefined ? '' : `,columns=${columnas}`),
        scale: 2,
    });

    if (resultado.image === null) {
        throw new Error(`No se pudo dibujar el timbre: ${resultado.error}`);
    }

    return new Uint8Array(await resultado.image.arrayBuffer());
}

/**
 * Lee un timbre desde su imagen, para verificar que lo dibujado es lo firmado.
 *
 * No usa la busqueda exhaustiva del lector: pensada para fotos torcidas o
 * borrosas, tarda segundos, y una imagen recien generada sale limpia.
 */
export async function leerTimbre(imagen: Uint8Array): Promise<Uint8Array | null> {
    const [lectura] = await readBarcodes(imagen, { formats: ['PDF417'], tryHarder: false });

    return lectura?.isValid ? lectura.bytes : null;
}

export function bytesDelTimbre(ted: XmlElement): Uint8Array {
    return new Uint8Array(Buffer.from(serialize(ted), 'latin1'));
}
