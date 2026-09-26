/**
 * typeDTE: documentos tributarios electronicos del SII de Chile.
 *
 * Este punto de entrada no carga nada de PDF. La representacion impresa vive
 * en `pdf.ts`, para que quien solo emite no arrastre sus dependencias.
 */

// Emitir en una llamada
export { emitir, type DocumentoEmitible, type DocumentoEmitido, type OpcionesEmision } from './emitir.ts';

// Modelo de documentos y calculo
export * from './core/dte/tipos.ts';
export {
    calcularTotales,
    calcularTotalesBoleta,
    calcularTotalesExportacion,
    calcularTotalesLiquidacion,
    DocumentoInvalidoError,
    MAXIMO_LINEAS,
    MAXIMO_LINEAS_BOLETA,
    TASA_IVA,
    type LineaCalculada,
    type MovimientoCalculado,
    type Totales,
    type TotalesLiquidacion,
} from './core/dte/totales.ts';

// Construccion por familia, para quien necesita armar paso a paso
export { agregarTimbre, construirDocumento, datosTimbre, envolverDte, idDocumento, NS_SII } from './core/dte/documento.ts';
export { construirBoleta, construirEnvioBoleta, datosTimbreBoleta, ID_SET_BOLETA, RUT_CONSUMIDOR_FINAL } from './core/dte/boleta.ts';
export { construirExportacion, datosTimbreExportacion, RUT_EXTRANJERO } from './core/dte/exportacion.ts';
export { construirLiquidacion, datosTimbreLiquidacion } from './core/dte/liquidacion.ts';
export { construirEnvioDte, ID_SET_DTE, RUT_SII, type Caratula } from './core/dte/envio.ts';

// Libros
export * from './core/libro/tipos.ts';
export { construirLibroCompraVenta, ID_ENVIO_LIBRO, lineaVentaDesde } from './core/libro/compra-venta.ts';
export { construirLibroGuias, lineaGuiaDesde } from './core/libro/guias.ts';

// Credenciales: CAF y certificado
export { parseCaf } from './adapters/caf/parse.ts';
export { CafError, contieneFolio, type Caf } from './core/ted/caf.ts';
export { cargarCertificado, CertificadoError, estaVigente, type Certificado } from './adapters/crypto/certificado.ts';

// Timbre, firma y validacion
export { timbrar, verificarTimbre } from './adapters/ted/timbrar.ts';
export type { DatosTimbre } from './core/ted/ted.ts';
export { FirmaError, firmarDocumento, verificarFirma } from './adapters/firma/firmar.ts';
export { cumpleEsquema, EsquemaInvalidoError, validarContraEsquema, type ErrorDeEsquema } from './adapters/schema/validar.ts';

// Comunicacion con el SII
export { endpointsBoletaDe, endpointsDe, esProduccion, type Ambiente, type Endpoints, type EndpointsBoleta } from './core/sii/ambiente.ts';
export { obtenerToken, tokenVigente, type OpcionesAutenticacion, type Token } from './adapters/sii/autenticacion.ts';
export {
    consultarEstado,
    enviarDocumentos,
    interpretarEstado,
    type Acuse,
    type EstadoEnvio,
    type OpcionesConsulta,
    type OpcionesEnvio,
    type ResultadoEstado,
} from './adapters/sii/envio.ts';
export {
    enviarBoletas,
    obtenerTokenBoletas,
    type OpcionesBoletas,
    type OpcionesEnvioBoletas,
} from './adapters/sii/boletas.ts';
export { SiiError, transporteFetch, type RespuestaHttp, type Transporte } from './adapters/sii/soap.ts';

// RUT y XML
export { calcularDigitoVerificador, formatRut, isRutValido, RutInvalidoError, rutANumero } from './core/rut/rut.ts';
export { el, type XmlChild, type XmlElement } from './core/xml/node.ts';
export { serialize, toLatin1, XML_DECLARATION } from './core/xml/serialize.ts';
export { sanitizeSiiText } from './core/xml/text.ts';
