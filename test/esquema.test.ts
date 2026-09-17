import { ok, strictEqual } from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
    cumpleEsquema,
    EsquemaInvalidoError,
    validarContraEsquema,
} from '../src/adapters/schema/validar.ts';

const NS = 'http://www.sii.cl/SiiDte';
const PROLOGO = '<?xml version="1.0" encoding="ISO-8859-1"?>';

describe('validacion contra los esquemas del SII', () => {
    it('resuelve los esquemas que se incluyen entre si', () => {
        // Si la inclusion fallara, el error hablaria de SiiTypes_v10.xsd en vez
        // del contenido del documento.
        const errores = capturar(`${PROLOGO}<DTE xmlns="${NS}" version="1.0"></DTE>`);

        ok(
            errores.every((e) => !e.includes('Failed to load')),
            `no resolvio las inclusiones: ${errores.join(' | ')}`
        );
    });

    it('rechaza un documento sin el namespace del SII', () => {
        const errores = capturar(`${PROLOGO}<DTE version="1.0"><Documento ID="F1"></Documento></DTE>`);

        ok(errores.some((e) => e.includes('No matching global declaration')));
    });

    it('nombra el elemento que falta', () => {
        const errores = capturar(
            `${PROLOGO}<DTE xmlns="${NS}" version="1.0"><Documento ID="F1T33"></Documento></DTE>`
        );

        ok(errores.some((e) => e.includes('Encabezado')), errores.join(' | '));
    });

    it('cumpleEsquema no lanza, solo responde', () => {
        strictEqual(cumpleEsquema(`${PROLOGO}<DTE xmlns="${NS}" version="1.0"></DTE>`, 'DTE_v10.xsd'), false);
    });

    it('reutiliza el esquema compilado entre llamadas', () => {
        const documento = `${PROLOGO}<DTE xmlns="${NS}" version="1.0"></DTE>`;

        cumpleEsquema(documento, 'DTE_v10.xsd');

        const inicio = performance.now();
        cumpleEsquema(documento, 'DTE_v10.xsd');

        ok(performance.now() - inicio < 50, 'la segunda validacion recompilo el esquema');
    });
});

function capturar(xml: string): string[] {
    try {
        validarContraEsquema(xml, 'DTE_v10.xsd');
        return [];
    } catch (error) {
        ok(error instanceof EsquemaInvalidoError);
        return error.errores.map((e) => e.mensaje);
    }
}
