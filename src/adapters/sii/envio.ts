import { XmlDocument } from 'libxml2-wasm';

import { endpointsDe, type Ambiente } from '../../core/sii/ambiente.ts';
import { toLatin1 } from '../../core/xml/serialize.ts';
import { llamarSoap, SiiError, transporteFetch, type Transporte } from './soap.ts';
import type { Token } from './autenticacion.ts';

export interface OpcionesEnvio {
    readonly ambiente: Ambiente;
    readonly token: Token;
    /** RUT del titular del certificado, que es quien envia. */
    readonly rutEnvia: string;
    readonly rutEmisor: string;
    readonly transporte?: Transporte;
}

export interface Acuse {
    readonly trackId: string;
    readonly recibidoEn: Date;
}

/**
 * Manda el sobre al SII.
 *
 * Devuelve un `trackId`, que es solo un acuse de recibo: el SII valida
 * despues, de forma asincrona. Tratar este resultado como aceptacion es el
 * error clasico. Para saber si quedo aceptado hay que consultar el estado.
 */
export async function enviarDocumentos(
    envioXml: string,
    opciones: OpcionesEnvio
): Promise<Acuse> {
    const transporte = opciones.transporte ?? transporteFetch;
    const cuerpo = new FormData();

    cuerpo.set('rutSender', cuerpoRut(opciones.rutEnvia));
    cuerpo.set('dvSender', digitoRut(opciones.rutEnvia));
    cuerpo.set('rutCompany', cuerpoRut(opciones.rutEmisor));
    cuerpo.set('dvCompany', digitoRut(opciones.rutEmisor));
    cuerpo.set(
        'archivo',
        new Blob([bytesDe(envioXml)], { type: 'text/xml' }),
        'envio.xml'
    );

    const respuesta = await transporte(endpointsDe(opciones.ambiente).subida, {
        method: 'POST',
        headers: { Cookie: `TOKEN=${opciones.token.valor}` },
        body: cuerpo,
    });

    if (respuesta.status !== 200) {
        throw new SiiError(`El SII respondio ${respuesta.status} al recibir el envio.`, respuesta.status);
    }

    return { trackId: leerTrackId(respuesta.cuerpo), recibidoEn: new Date() };
}

export type EstadoEnvio =
    | 'en_proceso'
    | 'aceptado'
    | 'aceptado_con_reparos'
    | 'rechazado'
    | 'desconocido';

export interface ResultadoEstado {
    readonly estado: EstadoEnvio;
    /** El codigo crudo del SII, util para depurar lo que no supimos mapear. */
    readonly codigo: string;
    readonly glosa: string | undefined;
}

/**
 * El SII responde con codigos cortos. Este mapa traduce los que importan y
 * deja pasar el resto como desconocido en vez de inventar un significado.
 */
const ESTADOS: ReadonlyMap<string, EstadoEnvio> = new Map([
    ['EPR', 'aceptado'],
    ['DOK', 'aceptado'],
    ['RCT', 'rechazado'],
    ['RCH', 'rechazado'],
    ['RFR', 'rechazado'],
    ['RSC', 'rechazado'],
    ['DNK', 'aceptado_con_reparos'],
    ['RPR', 'aceptado_con_reparos'],
    ['SOK', 'en_proceso'],
    ['REC', 'en_proceso'],
    ['PDR', 'en_proceso'],
    ['-11', 'en_proceso'],
]);

export interface OpcionesConsulta extends OpcionesEnvio {
    readonly trackId: string;
}

/** Pregunta en que quedo un envio. Es la unica forma de saber si fue aceptado. */
export async function consultarEstado(opciones: OpcionesConsulta): Promise<ResultadoEstado> {
    const transporte = opciones.transporte ?? transporteFetch;

    const respuesta = await llamarSoap(
        transporte,
        endpointsDe(opciones.ambiente).estadoEnvio,
        'getEstUp',
        [
            ['RutConsultante', cuerpoRut(opciones.rutEnvia)],
            ['DvConsultante', digitoRut(opciones.rutEnvia)],
            ['RutCompania', cuerpoRut(opciones.rutEmisor)],
            ['DvCompania', digitoRut(opciones.rutEmisor)],
            ['TrackId', opciones.trackId],
            ['Token', opciones.token.valor],
        ]
    );

    return interpretarEstado(respuesta);
}

export function interpretarEstado(respuesta: string): ResultadoEstado {
    const doc = XmlDocument.fromString(respuesta);

    try {
        const codigo = doc.get('//ESTADO')?.content?.trim() ?? '';
        const glosa = doc.get('//GLOSA')?.content?.trim();

        return {
            estado: ESTADOS.get(codigo) ?? 'desconocido',
            codigo,
            glosa: glosa === '' ? undefined : glosa,
        };
    } finally {
        doc.dispose();
    }
}

function leerTrackId(cuerpo: string): string {
    const doc = XmlDocument.fromString(cuerpo);

    try {
        const trackId = doc.get('//TRACKID')?.content?.trim();

        if (trackId === undefined || trackId === '') {
            const glosa = doc.get('//GLOSA')?.content?.trim();

            throw new SiiError(glosa ?? 'El SII no devolvio un TRACKID.');
        }

        return trackId;
    } finally {
        doc.dispose();
    }
}

/** El SII espera el archivo en ISO-8859-1, igual que su contenido declara. */
function bytesDe(xml: string): ArrayBuffer {
    const origen = toLatin1(xml);
    const destino = new ArrayBuffer(origen.byteLength);

    new Uint8Array(destino).set(origen);

    return destino;
}

function cuerpoRut(rut: string): string {
    return rut.split('-')[0]!;
}

function digitoRut(rut: string): string {
    return rut.split('-')[1]!;
}
