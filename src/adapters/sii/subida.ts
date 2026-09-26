import { toLatin1 } from '../../core/xml/serialize.ts';

/**
 * Cuerpo de una subida al SII. Los dos canales, el de facturas y el de
 * boletas, reciben los mismos campos con los mismos nombres.
 */
export function cuerpoDeSubida(
    rutEnvia: string,
    rutEmisor: string,
    xml: string,
    nombreArchivo: string
): FormData {
    const cuerpo = new FormData();

    cuerpo.set('rutSender', cuerpoRut(rutEnvia));
    cuerpo.set('dvSender', digitoRut(rutEnvia));
    cuerpo.set('rutCompany', cuerpoRut(rutEmisor));
    cuerpo.set('dvCompany', digitoRut(rutEmisor));
    cuerpo.set('archivo', new Blob([bytesDe(xml)], { type: 'text/xml' }), nombreArchivo);

    return cuerpo;
}

/** El SII espera el archivo en ISO-8859-1, igual que su contenido declara. */
function bytesDe(xml: string): ArrayBuffer {
    const origen = toLatin1(xml);
    const destino = new ArrayBuffer(origen.byteLength);

    new Uint8Array(destino).set(origen);

    return destino;
}

export function cuerpoRut(rut: string): string {
    return rut.split('-')[0]!;
}

export function digitoRut(rut: string): string {
    return rut.split('-')[1]!;
}
