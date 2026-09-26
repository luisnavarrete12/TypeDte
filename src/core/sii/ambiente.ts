/**
 * El SII tiene dos ambientes con los mismos servicios y distinto dominio.
 * Maullin es donde se prueba; Palena es donde las facturas son reales.
 */
export type Ambiente = 'certificacion' | 'produccion';

const DOMINIOS: Readonly<Record<Ambiente, string>> = {
    certificacion: 'https://maullin.sii.cl',
    produccion: 'https://palena.sii.cl',
};

export interface Endpoints {
    readonly semilla: string;
    readonly token: string;
    readonly subida: string;
    readonly estadoEnvio: string;
}

export function endpointsDe(ambiente: Ambiente): Endpoints {
    const dominio = DOMINIOS[ambiente];

    return {
        semilla: `${dominio}/DTEWS/CrSeed.jws`,
        token: `${dominio}/DTEWS/GetTokenFromSeed.jws`,
        subida: `${dominio}/cgi_dte/UPL/DTEUpload`,
        estadoEnvio: `${dominio}/DTEWS/QueryEstUp.jws`,
    };
}

/**
 * El SII recibe las boletas por un canal distinto al de las facturas: otra
 * API, otros dominios y respuestas en JSON en vez de XML. Por eso los
 * endpoints van aparte y no como una variante de los otros.
 */
export interface EndpointsBoleta {
    readonly semilla: string;
    readonly token: string;
    readonly subida: string;
}

const DOMINIOS_BOLETA: Readonly<Record<Ambiente, { autenticacion: string; subida: string }>> = {
    certificacion: { autenticacion: 'https://apicert.sii.cl', subida: 'https://pangal.sii.cl' },
    produccion: { autenticacion: 'https://api.sii.cl', subida: 'https://rahue.sii.cl' },
};

export function endpointsBoletaDe(ambiente: Ambiente): EndpointsBoleta {
    const { autenticacion, subida } = DOMINIOS_BOLETA[ambiente];

    return {
        semilla: `${autenticacion}/recursos/v1/boleta.electronica.semilla`,
        token: `${autenticacion}/recursos/v1/boleta.electronica.token`,
        subida: `${subida}/recursos/v1/boleta.electronica.envio`,
    };
}

export function esProduccion(ambiente: Ambiente): boolean {
    return ambiente === 'produccion';
}
