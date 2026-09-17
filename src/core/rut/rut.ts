/**
 * El SII recibe el RUT sin puntos, con guion y con la K en mayuscula.
 * Cualquier otra forma la rechaza aunque el numero sea correcto.
 */
const FORMATO_SII = /^0*(\d{1,8})-?([0-9K])$/;

export class RutInvalidoError extends Error {
    readonly entrada: string;

    constructor(entrada: string, motivo: string) {
        super(`RUT invalido (${entrada}): ${motivo}`);
        this.name = 'RutInvalidoError';
        this.entrada = entrada;
    }
}

/** Deja el RUT en la forma que espera el SII: `76543210-K`. */
export function formatRut(entrada: string): string {
    const { cuerpo, digito } = descomponer(entrada);
    const esperado = calcularDigitoVerificador(cuerpo);

    if (digito !== esperado) {
        throw new RutInvalidoError(entrada, `el digito verificador deberia ser ${esperado}`);
    }

    return `${cuerpo}-${digito}`;
}

export function isRutValido(entrada: string): boolean {
    try {
        formatRut(entrada);
        return true;
    } catch {
        return false;
    }
}

export function calcularDigitoVerificador(cuerpo: string): string {
    let suma = 0;
    let multiplicador = 2;

    for (let i = cuerpo.length - 1; i >= 0; i--) {
        suma += Number(cuerpo[i]) * multiplicador;
        multiplicador = multiplicador === 7 ? 2 : multiplicador + 1;
    }

    const resto = 11 - (suma % 11);

    if (resto === 11) {
        return '0';
    }

    return resto === 10 ? 'K' : String(resto);
}

/** Entrega el RUT como numero, que es como viaja dentro del timbre. */
export function rutANumero(entrada: string): number {
    return Number(descomponer(entrada).cuerpo);
}

function descomponer(entrada: string): { cuerpo: string; digito: string } {
    const limpio = entrada.replace(/[.\s]/g, '').toUpperCase();
    const coincidencia = FORMATO_SII.exec(limpio);

    if (coincidencia === null) {
        throw new RutInvalidoError(entrada, 'no tiene la forma cuerpo-digito');
    }

    const cuerpo = String(Number(coincidencia[1]));

    if (cuerpo === '0') {
        throw new RutInvalidoError(entrada, 'el cuerpo no puede ser cero');
    }

    return { cuerpo, digito: coincidencia[2]! };
}
