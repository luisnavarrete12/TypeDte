import { XmlDocument } from 'libxml2-wasm';

import { endpointsDe, type Ambiente } from '../../core/sii/ambiente.ts';
import { construirPeticionToken } from '../../core/sii/token.ts';
import { serialize, XML_DECLARATION } from '../../core/xml/serialize.ts';
import type { Certificado } from '../crypto/certificado.ts';
import { firmarDocumento } from '../firma/firmar.ts';
import { llamarSoap, SiiError, transporteFetch, type Transporte } from './soap.ts';

export interface OpcionesAutenticacion {
    readonly ambiente: Ambiente;
    readonly transporte?: Transporte;
}

export interface Token {
    readonly valor: string;
    readonly obtenidoEn: Date;
}

/**
 * El token del SII dura poco. Este margen evita usar uno que vence entre que
 * se arma el envio y llega al otro lado.
 */
const VIGENCIA_MINUTOS = 55;

/**
 * Obtiene el token con el que se envian los documentos.
 *
 * Son dos llamadas: el SII entrega una semilla al azar, uno se la devuelve
 * firmada con el certificado, y responde con el token. La llave privada nunca
 * sale del proceso.
 */
export async function obtenerToken(
    certificado: Certificado,
    opciones: OpcionesAutenticacion
): Promise<Token> {
    const transporte = opciones.transporte ?? transporteFetch;
    const endpoints = endpointsDe(opciones.ambiente);

    const semilla = await pedirSemilla(transporte, endpoints.semilla);
    const peticion = firmarDocumento(construirPeticionToken(semilla), null, certificado);
    const respuesta = await llamarSoap(transporte, endpoints.token, 'getToken', [
        ['pszXml', XML_DECLARATION + serialize(peticion)],
    ]);

    return { valor: leerCampo(respuesta, 'TOKEN'), obtenidoEn: new Date() };
}

export function tokenVigente(token: Token, momento: Date = new Date()): boolean {
    const minutos = (momento.getTime() - token.obtenidoEn.getTime()) / 60_000;

    return minutos >= 0 && minutos < VIGENCIA_MINUTOS;
}

async function pedirSemilla(transporte: Transporte, url: string): Promise<string> {
    const respuesta = await llamarSoap(transporte, url, 'getSeed', []);

    return leerCampo(respuesta, 'SEMILLA');
}

/**
 * Las respuestas del SII traen un `ESTADO` y, si algo fallo, un `GLOSA` que
 * explica. Conviene propagar esa glosa: es lo unico que dice por que.
 */
function leerCampo(respuesta: string, campo: string): string {
    const doc = XmlDocument.fromString(respuesta);

    try {
        const valor = doc.get(`//${campo}`)?.content?.trim();

        if (valor === undefined || valor === '') {
            const glosa = doc.get('//GLOSA')?.content?.trim();
            const estado = doc.get('//ESTADO')?.content?.trim();

            throw new SiiError(
                glosa !== undefined
                    ? `El SII rechazo la peticion (estado ${estado ?? 'desconocido'}): ${glosa}`
                    : `La respuesta del SII no trae ${campo}.`
            );
        }

        return valor;
    } finally {
        doc.dispose();
    }
}
