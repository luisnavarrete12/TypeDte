import { ok, rejects, strictEqual } from 'node:assert/strict';
import { describe, it } from 'node:test';

import { cargarCertificado } from '../src/adapters/crypto/certificado.ts';
import { obtenerToken, tokenVigente } from '../src/adapters/sii/autenticacion.ts';
import { consultarEstado, enviarDocumentos, interpretarEstado } from '../src/adapters/sii/envio.ts';
import { SiiError } from '../src/adapters/sii/soap.ts';
import { endpointsDe } from '../src/core/sii/ambiente.ts';
import { generarCertificadoFalso } from './support/certificado-falso.ts';
import {
    estado,
    respuestaEstado,
    SEMILLA,
    SUBIDA_OK,
    SUBIDA_RECHAZADA,
    TOKEN,
    TOKEN_RECHAZADO,
    transporteGrabado,
} from './support/sii-grabado.ts';

const AMBIENTE = 'certificacion' as const;

function certificado() {
    const { p12, clave } = generarCertificadoFalso({ rut: '11111111-1' });

    return cargarCertificado(p12, clave);
}

function opciones(transporte: ReturnType<typeof transporteGrabado>, trackId = '918273645') {
    return {
        ambiente: AMBIENTE,
        token: { valor: 'QTHISISATOKEN123', obtenidoEn: new Date() },
        rutEnvia: '11111111-1',
        rutEmisor: '44444444-4',
        transporte,
        trackId,
    };
}

describe('ambientes del SII', () => {
    it('apunta a maullin en certificacion y a palena en produccion', () => {
        ok(endpointsDe('certificacion').semilla.includes('maullin.sii.cl'));
        ok(endpointsDe('produccion').semilla.includes('palena.sii.cl'));
    });
});

describe('autenticacion', () => {
    it('pide la semilla, la firma y obtiene el token', async () => {
        const transporte = transporteGrabado({ CrSeed: SEMILLA, GetTokenFromSeed: TOKEN });
        const token = await obtenerToken(certificado(), { ambiente: AMBIENTE, transporte });

        strictEqual(token.valor, 'QTHISISATOKEN123');
        strictEqual(transporte.llamadas.length, 2);
    });

    it('manda la semilla firmada, no la semilla pelada', async () => {
        const transporte = transporteGrabado({ CrSeed: SEMILLA, GetTokenFromSeed: TOKEN });
        await obtenerToken(certificado(), { ambiente: AMBIENTE, transporte });

        const peticion = String(transporte.llamadas[1]!.init.body);

        ok(peticion.includes('043132133424'), 'no incluyo la semilla');
        ok(peticion.includes('SignatureValue'), 'no firmo la peticion');
        ok(peticion.includes('X509Certificate'), 'no adjunto el certificado');
    });

    it('propaga la glosa cuando el SII rechaza', async () => {
        const transporte = transporteGrabado({ CrSeed: SEMILLA, GetTokenFromSeed: TOKEN_RECHAZADO });

        await rejects(
            () => obtenerToken(certificado(), { ambiente: AMBIENTE, transporte }),
            (error: Error) => error instanceof SiiError && error.message.includes('Firma del token invalida')
        );
    });

    it('sabe cuando el token ya no sirve', () => {
        const token = { valor: 'x', obtenidoEn: new Date('2026-09-16T10:00:00Z') };

        ok(tokenVigente(token, new Date('2026-09-16T10:30:00Z')));
        ok(!tokenVigente(token, new Date('2026-09-16T11:30:00Z')));
    });
});

describe('envio de documentos', () => {
    it('devuelve el trackId del acuse', async () => {
        const transporte = transporteGrabado({ DTEUpload: SUBIDA_OK });
        const acuse = await enviarDocumentos('<EnvioDTE/>', opciones(transporte));

        strictEqual(acuse.trackId, '918273645');
    });

    it('manda el token en la cookie y el RUT partido en cuerpo y digito', async () => {
        const transporte = transporteGrabado({ DTEUpload: SUBIDA_OK });
        await enviarDocumentos('<EnvioDTE/>', opciones(transporte));

        const { init } = transporte.llamadas[0]!;
        const cuerpo = init.body as FormData;

        strictEqual((init.headers as Record<string, string>)['Cookie'], 'TOKEN=QTHISISATOKEN123');
        strictEqual(cuerpo.get('rutCompany'), '44444444');
        strictEqual(cuerpo.get('dvCompany'), '4');
        strictEqual(cuerpo.get('rutSender'), '11111111');
    });

    it('explica por que rechazo en vez de fallar en seco', async () => {
        const transporte = transporteGrabado({ DTEUpload: SUBIDA_RECHAZADA });

        await rejects(
            () => enviarDocumentos('<EnvioDTE/>', opciones(transporte)),
            (error: Error) => error.message.includes('Empresa no autorizada')
        );
    });
});

describe('estado del envio', () => {
    it('consulta por trackId', async () => {
        const transporte = transporteGrabado({ QueryEstUp: estado('EPR', 'Envio Procesado') });
        const resultado = await consultarEstado(opciones(transporte));

        strictEqual(resultado.estado, 'aceptado');
        strictEqual(resultado.codigo, 'EPR');
    });

    it('traduce los codigos del SII', () => {
        strictEqual(interpretarEstado(respuestaEstado('RCT', 'Rechazado')).estado, 'rechazado');
        strictEqual(interpretarEstado(respuestaEstado('RPR', 'Reparos')).estado, 'aceptado_con_reparos');
        strictEqual(interpretarEstado(respuestaEstado('SOK', 'En proceso')).estado, 'en_proceso');
    });

    it('no inventa significado para un codigo que no conoce', () => {
        const resultado = interpretarEstado(respuestaEstado('ZZZ', 'Algo nuevo'));

        strictEqual(resultado.estado, 'desconocido');
        strictEqual(resultado.codigo, 'ZZZ');
        strictEqual(resultado.glosa, 'Algo nuevo');
    });
});
