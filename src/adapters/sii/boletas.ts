import { endpointsBoletaDe, type Ambiente } from '../../core/sii/ambiente.ts';
import { construirPeticionToken } from '../../core/sii/token.ts';
import { serialize, XML_DECLARATION } from '../../core/xml/serialize.ts';
import type { Certificado } from '../crypto/certificado.ts';
import { firmarDocumento } from '../firma/firmar.ts';
import { leerCampoSii, type Token } from './autenticacion.ts';
import type { Acuse } from './envio.ts';
import { SiiError, transporteFetch, type Transporte } from './soap.ts';
import { cuerpoDeSubida } from './subida.ts';

/**
 * El canal de boletas del SII.
 *
 * Las boletas no viajan por donde viajan las facturas: el SII las recibe por
 * una API REST, en otros dominios, y responde en JSON. Lo unico que comparten
 * es la forma del cuerpo de la subida y que el token va en una cookie.
 */

/**
 * El SII revisa el agente en este canal. Se envia uno propio en vez de dejar
 * que lo ponga el motor de HTTP, que varia entre entornos.
 */
const AGENTE = 'Mozilla/4.0 (compatible; typeDTE)';

export interface OpcionesBoletas {
    readonly ambiente: Ambiente;
    readonly transporte?: Transporte;
}

/**
 * Obtiene el token del canal de boletas.
 *
 * Es el mismo baile que con las facturas —semilla, semilla firmada, token—
 * pero por REST en vez de SOAP, y contra otro dominio. El token de facturas
 * no sirve aca.
 */
export async function obtenerTokenBoletas(
    certificado: Certificado,
    opciones: OpcionesBoletas
): Promise<Token> {
    const transporte = opciones.transporte ?? transporteFetch;
    const endpoints = endpointsBoletaDe(opciones.ambiente);

    const semilla = leerCampoSii(await pedirSemilla(transporte, endpoints.semilla), 'SEMILLA');
    const peticion = firmarDocumento(construirPeticionToken(semilla), null, certificado);

    const respuesta = await transporte(endpoints.token, {
        method: 'POST',
        headers: { 'Content-Type': 'application/xml', accept: 'application/xml', 'User-Agent': AGENTE },
        body: XML_DECLARATION + serialize(peticion),
    });

    assertRespondio(respuesta.status, 'pedir el token de boletas');

    return { valor: leerCampoSii(respuesta.cuerpo, 'TOKEN'), obtenidoEn: new Date() };
}

export interface OpcionesEnvioBoletas extends OpcionesBoletas {
    readonly token: Token;
    /** RUT del titular del certificado, que es quien envia. */
    readonly rutEnvia: string;
    readonly rutEmisor: string;
}

/**
 * Manda el sobre de boletas al SII.
 *
 * Igual que con las facturas, lo que vuelve es un acuse de recibo: el SII
 * valida despues. La diferencia es que aca responde en JSON.
 */
export async function enviarBoletas(envioXml: string, opciones: OpcionesEnvioBoletas): Promise<Acuse> {
    const transporte = opciones.transporte ?? transporteFetch;

    const respuesta = await transporte(endpointsBoletaDe(opciones.ambiente).subida, {
        method: 'POST',
        headers: {
            Cookie: `TOKEN=${opciones.token.valor}`,
            accept: 'application/json',
            'User-Agent': AGENTE,
        },
        body: cuerpoDeSubida(opciones.rutEnvia, opciones.rutEmisor, envioXml, 'envioBoleta.xml'),
    });

    assertRespondio(respuesta.status, 'enviar las boletas');

    return { trackId: leerTrackId(respuesta.cuerpo), recibidoEn: new Date() };
}

/**
 * La documentacion consultada no dice con que metodo se pide la semilla. Se
 * usa GET, que es lo que corresponde a un recurso REST de solo lectura. Si el
 * SII respondiera 405, este es el unico punto a cambiar.
 */
async function pedirSemilla(transporte: Transporte, url: string): Promise<string> {
    const respuesta = await transporte(url, {
        method: 'GET',
        headers: { accept: 'application/xml', 'User-Agent': AGENTE },
    });

    assertRespondio(respuesta.status, 'pedir la semilla de boletas');

    return respuesta.cuerpo;
}

/**
 * Busca el numero de seguimiento en la respuesta sin exigir una forma exacta.
 *
 * El nombre del campo aparece escrito de varias maneras segun la version de
 * la API (`trackid`, `trackId`, `TRACKID`), asi que se acepta cualquiera en
 * vez de fallar por una mayuscula.
 */
function leerTrackId(cuerpo: string): string {
    const datos = interpretarJson(cuerpo);
    const trackId = buscar(datos, (clave) => /^track_?id$/i.test(clave));

    if (trackId === undefined) {
        throw new SiiError(`El SII no devolvio un track id: ${glosaDeError(datos) ?? cuerpo.slice(0, 200)}`);
    }

    return String(trackId);
}

function interpretarJson(cuerpo: string): unknown {
    try {
        return JSON.parse(cuerpo);
    } catch {
        throw new SiiError(`La respuesta del SII no es JSON: ${cuerpo.slice(0, 200)}`);
    }
}

/** El mensaje con que el SII explica un rechazo, si es que vino alguno. */
function glosaDeError(datos: unknown): string | undefined {
    const glosa = buscar(datos, (clave) => /^(glosa|descripcion|message|mensaje)$/i.test(clave));
    const estado = buscar(datos, (clave) => /^(estado|status|code)$/i.test(clave));

    if (glosa === undefined && estado === undefined) {
        return undefined;
    }

    return [estado, glosa].filter((parte) => parte !== undefined).join(': ');
}

/** Primer valor cuya clave cumpla la condicion, a cualquier profundidad. */
function buscar(datos: unknown, coincide: (clave: string) => boolean): string | number | undefined {
    if (datos === null || typeof datos !== 'object') {
        return undefined;
    }

    for (const [clave, valor] of Object.entries(datos)) {
        if (coincide(clave) && (typeof valor === 'string' || typeof valor === 'number')) {
            return valor;
        }

        const anidado = buscar(valor, coincide);

        if (anidado !== undefined) {
            return anidado;
        }
    }

    return undefined;
}

function assertRespondio(status: number, que: string): void {
    if (status !== 200) {
        throw new SiiError(`El SII respondio ${status} al ${que}.`, status);
    }
}
