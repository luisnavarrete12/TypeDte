import { el, fields, textElements, type XmlElement } from '../xml/node.ts';
import { NS_SII } from './documento.ts';
import { rutSii } from './partes.ts';

/** El RUT con el que el propio SII recibe los envios. */
export const RUT_SII = '60803000-K';

export interface Caratula {
    readonly rutEmisor: string;
    /** RUT de la persona que envia: el titular del certificado. */
    readonly rutEnvia: string;
    readonly rutReceptor: string;
    /** Fecha y numero de la resolucion que autorizo al emisor. */
    readonly fechaResolucion: string;
    readonly numeroResolucion: number;
    readonly timestampFirma: string;
}

export const ID_SET_DTE = 'SetDoc';

/**
 * Envuelve los documentos en el sobre que recibe el SII.
 *
 * Un envio agrupa documentos del mismo emisor para el mismo receptor. La
 * caratula resume cuantos van de cada tipo, y el SII contrasta ese resumen
 * con lo que viene adentro.
 */
export function construirEnvioDte(
    caratula: Caratula,
    documentos: readonly XmlElement[]
): XmlElement {
    return el('EnvioDTE', { xmlns: NS_SII, version: '1.0' }, [
        el('SetDTE', { ID: ID_SET_DTE }, [
            construirCaratula(caratula, documentos),
            ...documentos,
        ]),
    ]);
}

export function construirCaratula(caratula: Caratula, documentos: readonly XmlElement[]): XmlElement {
    return el('Caratula', { version: '1.0' }, [
        ...textElements([
            ['RutEmisor', rutSii(caratula.rutEmisor, 'emisor')],
            ['RutEnvia', rutSii(caratula.rutEnvia, 'que envia')],
            ['RutReceptor', rutSii(caratula.rutReceptor, 'receptor del envio')],
            ['FchResol', caratula.fechaResolucion],
            ['NroResol', caratula.numeroResolucion],
            ['TmstFirmaEnv', caratula.timestampFirma],
        ]),
        ...contarPorTipo(documentos).map(([tipo, cantidad]) =>
            fields('SubTotDTE', [
                ['TpoDTE', tipo],
                ['NroDTE', cantidad],
            ])
        ),
    ]);
}

/**
 * Cuenta cuantos documentos van de cada tipo, en el orden en que aparecieron.
 * El SII rechaza el envio si este resumen no calza con el contenido.
 */
function contarPorTipo(documentos: readonly XmlElement[]): [number, number][] {
    const conteo = new Map<number, number>();

    for (const documento of documentos) {
        const tipo = tipoDteDe(documento);

        if (tipo !== undefined) {
            conteo.set(tipo, (conteo.get(tipo) ?? 0) + 1);
        }
    }

    return [...conteo.entries()];
}

function tipoDteDe(dte: XmlElement): number | undefined {
    const texto = buscarTexto(dte, 'TipoDTE');

    return texto === undefined ? undefined : Number(texto);
}

function buscarTexto(elemento: XmlElement, nombre: string): string | undefined {
    for (const hijo of elemento.children ?? []) {
        if (typeof hijo !== 'object' || !('name' in hijo)) {
            continue;
        }

        if (hijo.name === nombre) {
            const valor = hijo.children?.[0];

            return typeof valor === 'string' ? valor : undefined;
        }

        const anidado = buscarTexto(hijo, nombre);

        if (anidado !== undefined) {
            return anidado;
        }
    }

    return undefined;
}
