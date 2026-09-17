const NS_SOAP = 'http://schemas.xmlsoap.org/soap/envelope/';

export interface RespuestaHttp {
    readonly status: number;
    readonly cuerpo: string;
}

/** Permite correr todo contra respuestas grabadas, sin red. */
export type Transporte = (url: string, init: RequestInit) => Promise<RespuestaHttp>;

export const transporteFetch: Transporte = async (url, init) => {
    const respuesta = await fetch(url, init);

    return { status: respuesta.status, cuerpo: await respuesta.text() };
};

export class SiiError extends Error {
    readonly status: number | undefined;

    constructor(mensaje: string, status?: number) {
        super(mensaje);
        this.name = 'SiiError';
        this.status = status;
    }
}

/**
 * Llama un servicio SOAP del SII armando el sobre a mano.
 *
 * Los WSDL del SII son antiguos y los clientes SOAP genericos tropiezan con
 * ellos. Como cada servicio recibe un punado de strings, construir el sobre
 * directo resulta mas corto y no depende de que una libreria interprete bien
 * un WSDL de hace veinte anos.
 */
export async function llamarSoap(
    transporte: Transporte,
    url: string,
    metodo: string,
    parametros: readonly (readonly [string, string])[]
): Promise<string> {
    const cuerpo = parametros
        .map(([nombre, valor]) => `<${nombre}>${escapar(valor)}</${nombre}>`)
        .join('');

    const sobre =
        `<?xml version="1.0" encoding="UTF-8"?>` +
        `<soapenv:Envelope xmlns:soapenv="${NS_SOAP}">` +
        `<soapenv:Body><${metodo}>${cuerpo}</${metodo}></soapenv:Body>` +
        `</soapenv:Envelope>`;

    const respuesta = await transporte(url, {
        method: 'POST',
        headers: {
            'Content-Type': 'text/xml; charset=utf-8',
            SOAPAction: '',
        },
        body: sobre,
    });

    if (respuesta.status !== 200) {
        throw new SiiError(`El SII respondio ${respuesta.status}.`, respuesta.status);
    }

    return extraerRespuesta(respuesta.cuerpo);
}

/**
 * El SII devuelve un XML dentro del sobre SOAP, escapado como texto.
 * Hay que sacarlo y desescaparlo para poder leerlo.
 */
export function extraerRespuesta(sobre: string): string {
    const contenido = /<(?:\w+:)?(\w*[Rr]eturn|\w*Result)[^>]*>([\s\S]*?)<\/(?:\w+:)?\1>/.exec(sobre);

    if (contenido === null) {
        throw new SiiError('La respuesta del SII no trae el cuerpo esperado.');
    }

    return desescapar(contenido[2]!.trim());
}

function escapar(texto: string): string {
    return texto
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
}

function desescapar(texto: string): string {
    return texto
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&apos;/g, "'")
        .replace(/&amp;/g, '&');
}
