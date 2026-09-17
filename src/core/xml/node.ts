/**
 * Arbol XML minimo y ordenado.
 *
 * El orden de `children` es significativo: los esquemas del SII declaran
 * secuencias, no conjuntos, y un elemento fuera de lugar invalida el documento.
 */
export interface XmlElement {
    readonly name: string;
    readonly attrs?: Readonly<Record<string, string>>;
    readonly children?: readonly XmlChild[];
}

export type XmlChild = XmlElement | XmlRaw | string;

/**
 * XML ya serializado que se inserta sin tocar.
 *
 * Existe por el CAF: el SII firmo ese bloque y valida su propia firma, asi
 * que tiene que viajar byte por byte como lo entrego.
 */
export interface XmlRaw {
    readonly raw: string;
}

export function raw(xml: string): XmlRaw {
    return { raw: xml };
}

export function isRaw(child: XmlChild): child is XmlRaw {
    return typeof child === 'object' && 'raw' in child;
}

export function el(
    name: string,
    attrs?: Record<string, string>,
    children?: readonly XmlChild[]
): XmlElement {
    return attrs && children
        ? { name, attrs, children }
        : attrs
          ? { name, attrs }
          : children
            ? { name, children }
            : { name };
}

/**
 * Construye un elemento con hijos de texto, omitiendo los que vengan vacios.
 *
 * El SII rechaza tags presentes pero sin contenido en varios nodos opcionales,
 * asi que la ausencia se representa no emitiendo el tag.
 */
export function fields(
    name: string,
    entries: readonly FieldEntry[]
): XmlElement {
    return el(name, undefined, textElements(entries));
}

export type FieldEntry = readonly [string, string | number | undefined | null];

/** Los mismos hijos de texto que produce `fields`, para componerlos a mano. */
export function textElements(entries: readonly FieldEntry[]): XmlElement[] {
    return entries
        .filter(([, value]) => value !== undefined && value !== null && value !== '')
        .map(([tag, value]) => el(tag, undefined, [String(value)]));
}

export function isElement(child: XmlChild): child is XmlElement {
    return typeof child !== 'string' && !isRaw(child);
}
