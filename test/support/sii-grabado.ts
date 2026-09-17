import type { RespuestaHttp, Transporte } from '../../src/adapters/sii/soap.ts';

export interface Llamada {
    readonly url: string;
    readonly init: RequestInit;
}

/**
 * Responde como el SII a partir de respuestas grabadas.
 *
 * Deja probar todo el flujo de comunicacion sin red y sin certificado real:
 * lo que se verifica es que armamos bien la peticion y que interpretamos bien
 * lo que llega de vuelta.
 */
export function transporteGrabado(
    respuestas: Readonly<Record<string, string | RespuestaHttp>>
): Transporte & { llamadas: Llamada[] } {
    const llamadas: Llamada[] = [];

    const transporte = async (url: string, init: RequestInit): Promise<RespuestaHttp> => {
        llamadas.push({ url, init });

        const clave = Object.keys(respuestas).find((parte) => url.includes(parte));

        if (clave === undefined) {
            throw new Error(`No hay respuesta grabada para ${url}`);
        }

        const grabada = respuestas[clave]!;

        return typeof grabada === 'string' ? { status: 200, cuerpo: grabada } : grabada;
    };

    return Object.assign(transporte, { llamadas });
}

export function sobreSoap(contenido: string): string {
    const escapado = contenido
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');

    return (
        `<?xml version="1.0" encoding="UTF-8"?>` +
        `<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/">` +
        `<soapenv:Body><ns1:getSeedResponse xmlns:ns1="urn:sii"><getSeedReturn>` +
        escapado +
        `</getSeedReturn></ns1:getSeedResponse></soapenv:Body></soapenv:Envelope>`
    );
}

export const SEMILLA = sobreSoap(
    `<?xml version="1.0"?><SII:RESPUESTA xmlns:SII="http://www.sii.cl/XMLSchema">` +
        `<SII:RESP_BODY><SEMILLA>043132133424</SEMILLA></SII:RESP_BODY>` +
        `<SII:RESP_HDR><ESTADO>00</ESTADO></SII:RESP_HDR></SII:RESPUESTA>`
);

export const TOKEN = sobreSoap(
    `<?xml version="1.0"?><SII:RESPUESTA xmlns:SII="http://www.sii.cl/XMLSchema">` +
        `<SII:RESP_BODY><TOKEN>QTHISISATOKEN123</TOKEN></SII:RESP_BODY>` +
        `<SII:RESP_HDR><ESTADO>00</ESTADO></SII:RESP_HDR></SII:RESPUESTA>`
);

export const TOKEN_RECHAZADO = sobreSoap(
    `<?xml version="1.0"?><SII:RESPUESTA xmlns:SII="http://www.sii.cl/XMLSchema">` +
        `<SII:RESP_HDR><ESTADO>-3</ESTADO><GLOSA>Firma del token invalida</GLOSA></SII:RESP_HDR>` +
        `</SII:RESPUESTA>`
);

export const SUBIDA_OK =
    `<?xml version="1.0" encoding="ISO-8859-1"?><RECEPCIONDTE>` +
    `<RUTSENDER>11111111</RUTSENDER><TRACKID>918273645</TRACKID>` +
    `<ESTADO>0</ESTADO></RECEPCIONDTE>`;

export const SUBIDA_RECHAZADA =
    `<?xml version="1.0" encoding="ISO-8859-1"?><RECEPCIONDTE>` +
    `<ESTADO>4</ESTADO><GLOSA>Empresa no autorizada a enviar documentos</GLOSA>` +
    `</RECEPCIONDTE>`;

/** La respuesta tal como viaja: dentro del sobre SOAP y escapada. */
export function estado(codigo: string, glosa: string): string {
    return sobreSoap(respuestaEstado(codigo, glosa));
}

/** La misma respuesta ya desenvuelta, para probar el interprete directo. */
export function respuestaEstado(codigo: string, glosa: string): string {
    return (
        `<?xml version="1.0"?><SII:RESPUESTA xmlns:SII="http://www.sii.cl/XMLSchema">` +
        `<SII:RESP_HDR><ESTADO>${codigo}</ESTADO><GLOSA>${glosa}</GLOSA></SII:RESP_HDR>` +
        `</SII:RESPUESTA>`
    );
}
