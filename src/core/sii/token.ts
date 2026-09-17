import { el, type XmlElement } from '../xml/node.ts';

/**
 * Arma la peticion de token: la semilla que entrego el SII, envuelta para
 * que se firme.
 *
 * El SII devuelve una semilla al azar, uno se la devuelve firmada, y con eso
 * prueba que tiene la llave privada del certificado sin mandarla nunca.
 */
export function construirPeticionToken(semilla: string): XmlElement {
    return el('getToken', undefined, [
        el('item', undefined, [el('Semilla', undefined, [semilla])]),
    ]);
}
