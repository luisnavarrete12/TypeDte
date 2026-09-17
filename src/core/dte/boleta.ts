import type { DatosTimbre } from '../ted/ted.ts';
import { el, fields, type XmlElement } from '../xml/node.ts';
import { NS_SII, idDocumento } from './documento.ts';
import { construirCaratula, type Caratula } from './envio.ts';
import { construirDetalle, construirMovimiento, rutSii } from './partes.ts';
import {
    TIPO_BOLETA,
    type Boleta,
    type Emisor,
    type IndicadorServicio,
    type ReceptorBoleta,
    type ReferenciaBoleta,
} from './tipos.ts';
import { calcularTotalesBoleta, type Totales } from './totales.ts';

/**
 * RUT generico que el SII usa para un consumidor sin identificar. Es lo que
 * lleva casi toda boleta: nadie da su RUT para comprar pan.
 */
export const RUT_CONSUMIDOR_FINAL = '66666666-6';

export const ID_SET_BOLETA = 'SetDoc';

const INDICADOR_SERVICIO: Readonly<Record<IndicadorServicio, number>> = {
    servicios_periodicos_domiciliarios: 1,
    otros_servicios_periodicos: 2,
    venta_y_servicios: 3,
    espectaculos: 4,
};

/**
 * Arma el `Documento` de una boleta.
 *
 * Comparte la idea con la factura pero no la forma: el emisor se llama
 * distinto (`RznSocEmisor` en vez de `RznSoc`), no hay tasa de IVA en los
 * totales, y el receptor es casi siempre anonimo. Por eso tiene su propio
 * constructor en vez de ramas dentro del de facturas.
 */
export function construirBoleta(
    boleta: Boleta,
    totales: Totales = calcularTotalesBoleta(boleta)
): XmlElement {
    return el('Documento', { ID: idDocumento(boleta.tipo, boleta.folio) }, [
        el('Encabezado', undefined, [
            fields('IdDoc', [
                ['TipoDTE', boleta.tipo],
                ['Folio', boleta.folio],
                ['FchEmis', boleta.fechaEmision],
                ['IndServicio', INDICADOR_SERVICIO[boleta.indicadorServicio ?? 'venta_y_servicios']],
            ]),
            construirEmisor(boleta.emisor),
            construirReceptor(boleta.receptor),
            construirTotales(boleta, totales),
        ]),
        ...totales.lineas.map((linea, indice) =>
            construirDetalle(linea, indice + 1, linea.exento && boleta.tipo !== TIPO_BOLETA.EXENTA)
        ),
        // En boletas el valor de un descuento en porcentaje admite un solo decimal.
        ...totales.movimientos.map((movimiento, indice) => construirMovimiento(movimiento, indice + 1, 1)),
        ...(boleta.referencias ?? []).map((referencia, indice) =>
            construirReferencia(referencia, indice + 1)
        ),
    ]);
}

export function datosTimbreBoleta(
    boleta: Boleta,
    totales: Totales = calcularTotalesBoleta(boleta)
): DatosTimbre {
    return {
        tipoDte: boleta.tipo,
        folio: boleta.folio,
        fechaEmision: boleta.fechaEmision,
        rutEmisor: rutSii(boleta.emisor.rut, 'emisor'),
        rutReceptor: rutSii(boleta.receptor?.rut ?? RUT_CONSUMIDOR_FINAL, 'receptor'),
        razonSocialReceptor: boleta.receptor?.razonSocial ?? '',
        montoTotal: totales.total,
        primerItem: boleta.items[0].nombre,
    };
}

/**
 * Envuelve boletas en su propio sobre. No sirve `EnvioDTE`: el SII recibe las
 * boletas por otro canal y valida contra otro esquema.
 */
export function construirEnvioBoleta(caratula: Caratula, boletas: readonly XmlElement[]): XmlElement {
    return el('EnvioBOLETA', { xmlns: NS_SII, version: '1.0' }, [
        el('SetDTE', { ID: ID_SET_BOLETA }, [construirCaratula(caratula, boletas), ...boletas]),
    ]);
}

function construirEmisor(emisor: Emisor): XmlElement {
    return fields('Emisor', [
        ['RUTEmisor', rutSii(emisor.rut, 'emisor')],
        ['RznSocEmisor', emisor.razonSocial],
        ['GiroEmisor', emisor.giro],
        ['CdgSIISucur', emisor.codigoSucursal],
        ['DirOrigen', emisor.direccion],
        ['CmnaOrigen', emisor.comuna],
        ['CiudadOrigen', emisor.ciudad],
    ]);
}

function construirReceptor(receptor: ReceptorBoleta | undefined): XmlElement {
    return fields('Receptor', [
        ['RUTRecep', rutSii(receptor?.rut ?? RUT_CONSUMIDOR_FINAL, 'receptor')],
        ['RznSocRecep', receptor?.razonSocial],
        ['Contacto', receptor?.contacto],
        ['DirRecep', receptor?.direccion],
        ['CmnaRecep', receptor?.comuna],
        ['CiudadRecep', receptor?.ciudad],
    ]);
}

function construirTotales(boleta: Boleta, totales: Totales): XmlElement {
    const hayAfecto = boleta.tipo === TIPO_BOLETA.AFECTA && totales.neto > 0;

    return fields('Totales', [
        ['MntNeto', hayAfecto ? totales.neto : undefined],
        ['MntExe', totales.exento > 0 ? totales.exento : undefined],
        ['IVA', hayAfecto ? totales.iva : undefined],
        ['MntTotal', String(totales.total)],
    ]);
}

function construirReferencia(referencia: ReferenciaBoleta, numero: number): XmlElement {
    return fields('Referencia', [
        ['NroLinRef', numero],
        ['CodRef', referencia.codigo],
        ['RazonRef', referencia.razon],
        ['CodVndor', referencia.codigoVendedor],
        ['CodCaja', referencia.codigoCaja],
    ]);
}
