/**
 * Representacion impresa: el PDF con el timbre en codigo PDF417.
 *
 * Va en un punto de entrada aparte porque trae dependencias de dibujo que no
 * necesita quien solo emite y envia al SII.
 */
export { generarPdfCarta, formatearMonto, formatearRut } from './adapters/pdf/carta.ts';
export { bytesDelTimbre, dibujarTimbre, leerTimbre } from './adapters/pdf/timbre.ts';
export {
    construirRepresentacion,
    nombreDocumento,
    type DocumentoImprimible,
    type FilaTotal,
    type LineaImpresa,
    type OpcionesRepresentacion,
    type ReferenciaImpresa,
    type Representacion,
} from './core/pdf/representacion.ts';
