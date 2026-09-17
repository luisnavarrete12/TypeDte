import { ok, strictEqual, throws } from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
    calcularDigitoVerificador,
    formatRut,
    isRutValido,
    RutInvalidoError,
    rutANumero,
} from '../src/core/rut/rut.ts';

describe('RUT', () => {
    it('calcula el digito verificador', () => {
        strictEqual(calcularDigitoVerificador('76543210'), '3');
        strictEqual(calcularDigitoVerificador('78416626'), '0');
        strictEqual(calcularDigitoVerificador('12345678'), '5');
    });

    it('normaliza a la forma que espera el SII', () => {
        strictEqual(formatRut('76.543.210-3'), '76543210-3');
        strictEqual(formatRut('765432103'), '76543210-3');
        strictEqual(formatRut(' 12.345.678 - 5 '), '12345678-5');
    });

    it('quita los ceros a la izquierda', () => {
        strictEqual(formatRut('012345678-5'), '12345678-5');
    });

    it('rechaza un digito verificador que no corresponde', () => {
        throws(() => formatRut('76543210-1'), RutInvalidoError);
        ok(!isRutValido('12345678-9'));
    });

    it('rechaza basura', () => {
        for (const entrada of ['', 'hola', '0-0', '123456789-5', '76543210-X']) {
            ok(!isRutValido(entrada), `deberia rechazar ${entrada}`);
        }
    });

    it('entrega el cuerpo como numero para el timbre', () => {
        strictEqual(rutANumero('76.543.210-3'), 76543210);
    });
});
