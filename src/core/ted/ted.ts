import { el, raw, textElements, type XmlElement } from '../xml/node.ts';
import { sanitizeSiiText } from '../xml/text.ts';
import { assertFolioEnRango, assertTipoDte, type Caf } from './caf.ts';

/** Datos del documento que entran al timbre. Son los que el SII verifica. */
export interface DatosTimbre {
    readonly tipoDte: number;
    readonly folio: number;
    readonly fechaEmision: string;
    readonly rutEmisor: string;
    readonly rutReceptor: string;
    readonly razonSocialReceptor: string;
    readonly montoTotal: number;
    readonly primerItem: string;
}

/** El esquema del SII limita estos dos campos a 40 caracteres. */
const LARGO_MAXIMO = 40;

/**
 * Arma el nodo `DD`, que es lo que se firma para producir el timbre.
 *
 * Funcion pura: los mismos datos producen siempre el mismo nodo. Es lo que
 * permite probar el timbre completo sin tocar la red ni gastar un folio.
 */
export function construirDD(datos: DatosTimbre, caf: Caf, timestamp: string): XmlElement {
    assertTipoDte(caf, datos.tipoDte);
    assertFolioEnRango(caf, datos.folio);

    return el('DD', undefined, [
        ...textElements([
            ['RE', datos.rutEmisor],
            ['TD', datos.tipoDte],
            ['F', datos.folio],
            ['FE', datos.fechaEmision],
            ['RR', datos.rutReceptor],
        ]),
        // RSR se emite siempre, aunque venga vacio: en una boleta a un
        // consumidor anonimo no hay razon social, pero el tag es obligatorio.
        el('RSR', undefined, [recortar(datos.razonSocialReceptor)]),
        ...textElements([
            ['MNT', Math.round(datos.montoTotal)],
            ['IT1', recortar(datos.primerItem)],
        ]),
        raw(caf.xml),
        el('TSTED', undefined, [timestamp]),
    ]);
}

export function ensamblarTed(dd: XmlElement, firmaBase64: string): XmlElement {
    return el('TED', { version: '1.0' }, [
        dd,
        el('FRMT', { algoritmo: 'SHA1withRSA' }, [firmaBase64]),
    ]);
}

/**
 * Recorta al limite del esquema despues de sanear.
 *
 * El orden importa: sanear puede cambiar el largo (los puntos suspensivos
 * tipograficos se vuelven tres puntos), asi que recortar antes dejaria pasar
 * un texto de 42 caracteres.
 */
function recortar(texto: string): string {
    return sanitizeSiiText(texto).slice(0, LARGO_MAXIMO);
}
