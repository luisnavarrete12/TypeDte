import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { XmlDocument, XsdValidator } from 'libxml2-wasm';
import { xmlRegisterFsInputProviders } from 'libxml2-wasm/lib/nodejs.mjs';

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const DIRECTORIO_ESQUEMAS = join(RAIZ, 'resources', 'schemas');

export interface ErrorDeEsquema {
    readonly mensaje: string;
    readonly linea?: number;
}

export class EsquemaInvalidoError extends Error {
    readonly errores: readonly ErrorDeEsquema[];

    constructor(esquema: string, errores: readonly ErrorDeEsquema[]) {
        const detalle = errores.map((e) => `  - ${e.mensaje}`).join('\n');
        super(`El XML no cumple ${esquema}:\n${detalle}`);
        this.name = 'EsquemaInvalidoError';
        this.errores = errores;
    }
}

/**
 * Los esquemas se compilan una vez. Compilarlos es caro y en un proceso que
 * emite documentos se usan miles de veces.
 */
const compilados = new Map<string, XsdValidator>();

/**
 * Los esquemas del SII se incluyen entre si (`xs:include`), y libxml2 corre
 * en WASM sin acceso al disco. Este proveedor le presta el sistema de
 * archivos para que pueda resolver esas inclusiones.
 *
 * Solo habilita lectura de archivos para los esquemas. Los documentos se
 * siguen parseando desde string y sin sustitucion de entidades, que es lo
 * que evitaria que un XML ajeno leyera archivos locales.
 */
let proveedorRegistrado = false;

function registrarProveedorDeArchivos(): void {
    if (!proveedorRegistrado) {
        xmlRegisterFsInputProviders();
        proveedorRegistrado = true;
    }
}

/**
 * Valida contra los esquemas oficiales del SII.
 *
 * Es el filtro que hace barato equivocarse: el SII entrega pocos folios de
 * certificacion y cada envio rechazado gasta uno. Un error de estructura
 * detectado aca no cuesta nada.
 */
export function validarContraEsquema(xml: string, esquema: string): void {
    const errores = revisar(xml, esquema);

    if (errores.length > 0) {
        throw new EsquemaInvalidoError(esquema, errores);
    }
}

export function cumpleEsquema(xml: string, esquema: string): boolean {
    return revisar(xml, esquema).length === 0;
}

function revisar(xml: string, esquema: string): ErrorDeEsquema[] {
    const validador = compilar(esquema);
    const doc = XmlDocument.fromString(xml);

    try {
        validador.validate(doc);
        return [];
    } catch (error) {
        return interpretar(error);
    } finally {
        doc.dispose();
    }
}

function compilar(esquema: string): XsdValidator {
    const existente = compilados.get(esquema);

    if (existente !== undefined) {
        return existente;
    }

    registrarProveedorDeArchivos();

    const ruta = join(DIRECTORIO_ESQUEMAS, esquema);
    const fuente = XmlDocument.fromBuffer(readFileSync(ruta), { url: pathToUrl(ruta) });

    try {
        const validador = XsdValidator.fromDoc(fuente);
        compilados.set(esquema, validador);

        return validador;
    } finally {
        fuente.dispose();
    }
}

/**
 * libxml2 resuelve los `xs:include` relativos a esta URL.
 *
 * Tiene que ser una URL `file://`: el proveedor de archivos no reconoce una
 * ruta de Windows con letra de unidad y falla al incluir los otros esquemas.
 */
function pathToUrl(ruta: string): string {
    return pathToFileURL(ruta).href;
}

function interpretar(error: unknown): ErrorDeEsquema[] {
    const detalles = (error as { details?: { message?: string; line?: number }[] }).details;

    if (Array.isArray(detalles) && detalles.length > 0) {
        return detalles.map((detalle) => ({
            mensaje: (detalle.message ?? 'error sin descripcion').trim(),
            ...(detalle.line === undefined ? {} : { linea: detalle.line }),
        }));
    }

    return [{ mensaje: error instanceof Error ? error.message : String(error) }];
}
