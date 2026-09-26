import { ok, rejects, strictEqual } from 'node:assert/strict';
import { describe, it } from 'node:test';

import { cargarCertificado } from '../src/adapters/crypto/certificado.ts';
import { enviarBoletas, obtenerTokenBoletas } from '../src/adapters/sii/boletas.ts';
import { SiiError } from '../src/adapters/sii/soap.ts';
import { endpointsBoletaDe } from '../src/core/sii/ambiente.ts';
import { generarCertificadoFalso } from './support/certificado-falso.ts';
import { transporteGrabado } from './support/sii-grabado.ts';

const AMBIENTE = 'certificacion' as const;
const TOKEN = { valor: 'QTOKENDEBOLETAS', obtenidoEn: new Date() };

function certificado() {
    const { p12, clave } = generarCertificadoFalso({ rut: '11111111-1' });

    return cargarCertificado(p12, clave);
}

/** Las respuestas del canal de boletas: XML para autenticar, JSON para el envio. */
const SEMILLA =
    '<?xml version="1.0"?><SII:RESPUESTA xmlns:SII="http://www.sii.cl/XMLSchema">' +
    '<SII:RESP_BODY><SEMILLA>030530912644</SEMILLA></SII:RESP_BODY>' +
    '<SII:RESP_HDR><ESTADO>00</ESTADO></SII:RESP_HDR></SII:RESPUESTA>';

const TOKEN_XML =
    '<?xml version="1.0"?><SII:RESPUESTA xmlns:SII="http://www.sii.cl/XMLSchema">' +
    '<SII:RESP_BODY><TOKEN>QTOKENDEBOLETAS</TOKEN></SII:RESP_BODY>' +
    '<SII:RESP_HDR><ESTADO>00</ESTADO></SII:RESP_HDR></SII:RESPUESTA>';

const ENVIO_OK = '{"fecha_recepcion":"2026-09-25 13:05:00","status":"REC","trackid":9182736450}';

function opciones(transporte: ReturnType<typeof transporteGrabado>) {
    return { ambiente: AMBIENTE, token: TOKEN, rutEnvia: '11111111-1', rutEmisor: '44444444-4', transporte };
}

describe('canal de boletas del SII', () => {
    it('no usa los mismos dominios que las facturas', () => {
        const certificacion = endpointsBoletaDe('certificacion');

        ok(certificacion.semilla.startsWith('https://apicert.sii.cl/'));
        ok(certificacion.subida.startsWith('https://pangal.sii.cl/'));
        ok(endpointsBoletaDe('produccion').subida.startsWith('https://rahue.sii.cl/'));
        ok(certificacion.subida.endsWith('/recursos/v1/boleta.electronica.envio'));
    });

    it('obtiene su propio token: el de facturas no sirve aca', async () => {
        const transporte = transporteGrabado({
            'boleta.electronica.semilla': SEMILLA,
            'boleta.electronica.token': TOKEN_XML,
        });
        const token = await obtenerTokenBoletas(certificado(), { ambiente: AMBIENTE, transporte });

        strictEqual(token.valor, 'QTOKENDEBOLETAS');
        strictEqual(transporte.llamadas.length, 2);
        ok(transporte.llamadas[0]!.url.includes('apicert.sii.cl'));
    });

    it('manda la semilla firmada como XML, no dentro de un sobre SOAP', async () => {
        const transporte = transporteGrabado({
            'boleta.electronica.semilla': SEMILLA,
            'boleta.electronica.token': TOKEN_XML,
        });
        await obtenerTokenBoletas(certificado(), { ambiente: AMBIENTE, transporte });

        const peticion = transporte.llamadas[1]!;
        const cuerpo = String(peticion.init.body);

        ok(cuerpo.includes('030530912644'), 'no incluyo la semilla');
        ok(cuerpo.includes('SignatureValue'), 'no la firmo');
        ok(!cuerpo.includes('Envelope'), 'la envolvio en SOAP');
        strictEqual((peticion.init.headers as Record<string, string>)['Content-Type'], 'application/xml');
    });

    it('sube el sobre con el token en la cookie y el archivo de boletas', async () => {
        const transporte = transporteGrabado({ 'boleta.electronica.envio': ENVIO_OK });
        const acuse = await enviarBoletas('<EnvioBOLETA/>', opciones(transporte));

        strictEqual(acuse.trackId, '9182736450');

        const { url, init } = transporte.llamadas[0]!;
        const cuerpo = init.body as FormData;

        ok(url.includes('pangal.sii.cl'));
        strictEqual((init.headers as Record<string, string>)['Cookie'], `TOKEN=${TOKEN.valor}`);
        strictEqual(cuerpo.get('rutCompany'), '44444444');
        strictEqual(cuerpo.get('dvCompany'), '4');
        strictEqual((cuerpo.get('archivo') as File).name, 'envioBoleta.xml');
    });

    it('acepta el numero de seguimiento escrito de cualquier forma', async () => {
        for (const respuesta of ['{"trackid":1}', '{"trackId":1}', '{"TRACKID":"1"}', '{"data":{"track_id":1}}']) {
            const transporte = transporteGrabado({ 'boleta.electronica.envio': respuesta });

            strictEqual((await enviarBoletas('<EnvioBOLETA/>', opciones(transporte))).trackId, '1');
        }
    });

    it('explica el rechazo con lo que dice el SII', async () => {
        const transporte = transporteGrabado({
            'boleta.electronica.envio': '{"status":"ERR","descripcion":"Empresa no autorizada a enviar boletas"}',
        });

        await rejects(
            () => enviarBoletas('<EnvioBOLETA/>', opciones(transporte)),
            (error: Error) => error instanceof SiiError && error.message.includes('Empresa no autorizada'),
        );
    });

    it('avisa cuando la respuesta no es JSON en vez de fallar en otro lado', async () => {
        const transporte = transporteGrabado({ 'boleta.electronica.envio': '<html>Error 500</html>' });

        await rejects(
            () => enviarBoletas('<EnvioBOLETA/>', opciones(transporte)),
            (error: Error) => error.message.includes('no es JSON'),
        );
    });

    it('propaga el codigo cuando el SII no responde 200', async () => {
        const transporte = transporteGrabado({
            'boleta.electronica.envio': { status: 503, cuerpo: 'Service Unavailable' },
        });

        await rejects(
            () => enviarBoletas('<EnvioBOLETA/>', opciones(transporte)),
            (error: Error) => error instanceof SiiError && error.message.includes('503'),
        );
    });
});
