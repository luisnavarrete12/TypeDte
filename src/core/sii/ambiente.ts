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

export function esProduccion(ambiente: Ambiente): boolean {
    return ambiente === 'produccion';
}
