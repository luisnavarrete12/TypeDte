import type { Caf } from '../../core/ted/caf.ts';
import { construirDD, ensamblarTed, type DatosTimbre } from '../../core/ted/ted.ts';
import { el, type XmlElement } from '../../core/xml/node.ts';
import { serialize, XML_DECLARATION } from '../../core/xml/serialize.ts';
import { canonicalizarAplanado } from '../xml/canonical.ts';
import { firmarSha1ConRsa, verificarSha1ConRsa } from '../crypto/rsa.ts';

/**
 * Produce el timbre electronico del documento.
 *
 * El SII no firma sobre el XML que uno escribe, sino sobre su forma
 * canonicalizada y aplanada. Por eso aca se serializa, se canonicaliza y
 * recien entonces se firma: saltarse ese paso produce una firma que valida
 * localmente y que el SII rechaza.
 */
export function timbrar(datos: DatosTimbre, caf: Caf, timestamp: string): XmlElement {
    const dd = construirDD(datos, caf, timestamp);
    const firma = firmarSha1ConRsa(canonicalizarDD(dd), caf.llavePrivadaPem);

    return ensamblarTed(dd, firma);
}

/** Rehace el calculo del timbre y compara, sin llamar al SII. */
export function verificarTimbre(ted: XmlElement, caf: Caf): boolean {
    const dd = ted.children?.find(
        (hijo) => typeof hijo === 'object' && 'name' in hijo && hijo.name === 'DD'
    );
    const frmt = ted.children?.find(
        (hijo) => typeof hijo === 'object' && 'name' in hijo && hijo.name === 'FRMT'
    );

    if (dd === undefined || frmt === undefined) {
        return false;
    }

    const firma = (frmt as XmlElement).children?.[0];

    if (typeof firma !== 'string') {
        return false;
    }

    return verificarSha1ConRsa(canonicalizarDD(dd as XmlElement), firma, caf.llavePublicaPem);
}

function canonicalizarDD(dd: XmlElement): string {
    const envoltorio = serialize(el('TED', { version: '1.0' }, [dd]));

    return canonicalizarAplanado(XML_DECLARATION + envoltorio, '/TED/DD');
}
