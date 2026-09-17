/**
 * Un CAF es el permiso del SII para usar un rango de folios de un tipo de
 * documento. Trae ademas la llave privada con la que se timbra: sin CAF no
 * hay timbre, y sin timbre el documento no es valido.
 */
export interface Caf {
    readonly rutEmisor: string;
    readonly razonSocial: string;
    readonly tipoDte: number;
    readonly folioDesde: number;
    readonly folioHasta: number;
    readonly fechaAutorizacion: string;
    readonly llavePrivadaPem: string;
    readonly llavePublicaPem: string;
    /**
     * El elemento `<CAF>` tal cual vino del SII.
     *
     * Viaja verbatim dentro del timbre porque el SII valida su propia firma
     * sobre el bloque `<DA>`. Reconstruirlo desde los campos parseados lo
     * invalidaria.
     */
    readonly xml: string;
}

export class CafError extends Error {
    constructor(mensaje: string) {
        super(mensaje);
        this.name = 'CafError';
    }
}

export function contieneFolio(caf: Caf, folio: number): boolean {
    return folio >= caf.folioDesde && folio <= caf.folioHasta;
}

export function assertFolioEnRango(caf: Caf, folio: number): void {
    if (!contieneFolio(caf, folio)) {
        throw new CafError(
            `El folio ${folio} esta fuera del rango autorizado ${caf.folioDesde}-${caf.folioHasta}.`
        );
    }
}

export function assertTipoDte(caf: Caf, tipoDte: number): void {
    if (caf.tipoDte !== tipoDte) {
        throw new CafError(
            `El CAF autoriza documentos tipo ${caf.tipoDte}, no tipo ${tipoDte}.`
        );
    }
}
