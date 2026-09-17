/**
 * El SII exige los documentos en ISO-8859-1. Un caracter fuera de ese rango
 * no sobrevive la conversion, y como la firma se calcula sobre el texto ya
 * convertido, el documento queda firmado sobre algo distinto a lo que se envio.
 *
 * El caso clasico es la raya larga que insertan los editores de texto al
 * escribir un guion entre espacios.
 */
const TRANSLITERACIONES: ReadonlyMap<string, string> = new Map([
    ['\u2010', '-'], ['\u2011', '-'], ['\u2012', '-'], ['\u2013', '-'],
    ['\u2014', '-'], ['\u2015', '-'], ['\u2212', '-'],
    ['\u2018', "'"], ['\u2019', "'"], ['\u201A', "'"], ['\u201B', "'"],
    ['\u201C', '"'], ['\u201D', '"'], ['\u201E', '"'], ['\u201F', '"'],
    ['\u2026', '...'],
    ['\u00A0', ' '], ['\u2007', ' '], ['\u202F', ' '], ['\u200B', ''],
    ['\u2022', '-'], ['\u2032', "'"], ['\u2033', '"'],
    ['\u20AC', 'EUR'], ['\u2122', 'TM'],
]);

const FUERA_DE_LATIN1 = /[^\u0000-\u00FF]/;

/**
 * Deja el texto dentro del rango representable en ISO-8859-1.
 *
 * Los acentos y la enie se conservan: son parte de latin-1. Lo que se
 * reemplaza es la puntuacion tipografica y los simbolos que no lo son.
 */
export function sanitizeSiiText(text: string): string {
    let resultado = '';

    for (const caracter of text.normalize('NFC')) {
        resultado += convertir(caracter);
    }

    return resultado;
}

function convertir(caracter: string): string {
    const transliteracion = TRANSLITERACIONES.get(caracter);
    if (transliteracion !== undefined) {
        return transliteracion;
    }

    if (caracter.charCodeAt(0) <= 0xff) {
        return caracter;
    }

    // Ultimo recurso: quitarle los acentos y ver si lo que queda si cabe.
    const sinAcentos = caracter.normalize('NFD').replace(/[̀-ͯ]/g, '');

    return cabeEnLatin1(sinAcentos) && sinAcentos !== '' ? sinAcentos : '?';
}

export function cabeEnLatin1(text: string): boolean {
    return !FUERA_DE_LATIN1.test(text);
}

const ESCAPES_TEXTO: ReadonlyMap<string, string> = new Map([
    ['&', '&amp;'],
    ['<', '&lt;'],
    ['>', '&gt;'],
]);

const ESCAPES_ATRIBUTO: ReadonlyMap<string, string> = new Map([
    ['&', '&amp;'],
    ['<', '&lt;'],
    ['>', '&gt;'],
    ['"', '&quot;'],
    ['\r', '&#xD;'],
]);

export function escapeText(text: string): string {
    return reemplazar(text, ESCAPES_TEXTO, /[&<>]/g);
}

export function escapeAttribute(text: string): string {
    return reemplazar(text, ESCAPES_ATRIBUTO, /[&<>"\r]/g);
}

function reemplazar(
    text: string,
    tabla: ReadonlyMap<string, string>,
    patron: RegExp
): string {
    return text.replace(patron, (caracter) => tabla.get(caracter) ?? caracter);
}
