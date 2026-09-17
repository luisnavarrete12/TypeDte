import { isElement, isRaw, type XmlChild, type XmlElement } from './node.ts';
import { escapeAttribute, escapeText, sanitizeSiiText } from './text.ts';

export interface SerializeOptions {
    /** Antepone el prologo con el encoding que exige el SII. */
    readonly declaration?: boolean;
    /**
     * Indenta para lectura humana. Nunca usar sobre algo que se vaya a firmar:
     * los espacios entran al digest y cambian la firma.
     */
    readonly indent?: string;
}

export const XML_DECLARATION = '<?xml version="1.0" encoding="ISO-8859-1"?>';

/**
 * Serializa el arbol de forma determinista.
 *
 * Determinista significa que el mismo arbol produce siempre los mismos bytes:
 * mismo orden de atributos, mismo escapado, y elementos vacios siempre como
 * par de tags. Es la condicion para que la firma calce, porque el digest se
 * calcula sobre estos bytes y no sobre la estructura.
 */
export function serialize(root: XmlElement, options: SerializeOptions = {}): string {
    const cuerpo = serializeElement(root, options.indent, 0);

    return options.declaration ? XML_DECLARATION + separador(options.indent) + cuerpo : cuerpo;
}

function serializeElement(element: XmlElement, indent: string | undefined, nivel: number): string {
    const apertura = `<${element.name}${serializeAttributes(element.attrs)}`;
    const hijos = element.children ?? [];

    if (hijos.length === 0) {
        return `${apertura}></${element.name}>`;
    }

    const sangriaActual = indent === undefined ? '' : indent.repeat(nivel);
    const soloTexto = hijos.every((hijo) => !isElement(hijo) && !isRaw(hijo));
    const separaHijos = indent !== undefined && !soloTexto;

    const contenido = hijos
        .map((hijo) => {
            const serializado = serializeChild(hijo, indent, nivel + 1);
            return separaHijos ? `\n${indent.repeat(nivel + 1)}${serializado}` : serializado;
        })
        .join('');

    const cierre = separaHijos ? `\n${sangriaActual}` : '';

    return `${apertura}>${contenido}${cierre}</${element.name}>`;
}

function serializeChild(child: XmlChild, indent: string | undefined, nivel: number): string {
    if (isElement(child)) {
        return serializeElement(child, indent, nivel);
    }

    return isRaw(child) ? child.raw : escapeText(sanitizeSiiText(child));
}

function serializeAttributes(attrs: Readonly<Record<string, string>> | undefined): string {
    if (attrs === undefined) {
        return '';
    }

    return Object.entries(attrs)
        .map(([nombre, valor]) => ` ${nombre}="${escapeAttribute(sanitizeSiiText(valor))}"`)
        .join('');
}

function separador(indent: string | undefined): string {
    return indent === undefined ? '' : '\n';
}

/** Convierte a los bytes que se envian al SII y sobre los que se firma. */
export function toLatin1(xml: string): Buffer {
    return Buffer.from(xml, 'latin1');
}
