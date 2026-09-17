import type { DatosTimbre } from '../ted/ted.ts';
import { decimal } from './formato.ts';
import { el, fields, textElements, type XmlElement } from '../xml/node.ts';
import { idDocumento } from './documento.ts';
import { construirDetalle, construirEmisor, construirReferencia, FORMA_PAGO, rutSii } from './partes.ts';
import type { Comision, LiquidacionFactura, Receptor } from './tipos.ts';
import {
    calcularComision,
    calcularTotalesLiquidacion,
    TASA_IVA,
    type TotalesLiquidacion,
} from './totales.ts';

/**
 * Arma una liquidacion-factura (43), bajo el nodo `Liquidacion` del esquema.
 *
 * El detalle son las ventas hechas por cuenta del mandante. Las comisiones
 * del consignatario van en su propia seccion y tambien resumidas en los
 * totales, y el total final es lo que se le rinde al mandante.
 */
export function construirLiquidacion(
    liquidacion: LiquidacionFactura,
    totales: TotalesLiquidacion = calcularTotalesLiquidacion(liquidacion)
): XmlElement {
    return el('Liquidacion', { ID: idDocumento(liquidacion.tipo, liquidacion.folio) }, [
        el('Encabezado', undefined, [
            fields('IdDoc', [
                ['TipoDTE', liquidacion.tipo],
                ['Folio', liquidacion.folio],
                ['FchEmis', liquidacion.fechaEmision],
                ['FmaPago', liquidacion.formaPago === undefined ? undefined : FORMA_PAGO[liquidacion.formaPago]],
                ['FchVenc', liquidacion.fechaVencimiento],
            ]),
            construirEmisor(liquidacion.emisor),
            construirReceptor(liquidacion.receptor),
            construirTotales(totales),
        ]),
        ...totales.lineas.map((linea, indice) =>
            construirDetalle(linea, indice + 1, linea.exento, liquidacion.items[indice]!.tipoDocumentoLiquidado)
        ),
        ...(liquidacion.referencias ?? []).map((referencia, indice) => construirReferencia(referencia, indice + 1)),
        ...liquidacion.comisiones.map((comision, indice) => construirComision(comision, indice + 1)),
    ]);
}

export function datosTimbreLiquidacion(
    liquidacion: LiquidacionFactura,
    totales: TotalesLiquidacion = calcularTotalesLiquidacion(liquidacion)
): DatosTimbre {
    return {
        tipoDte: liquidacion.tipo,
        folio: liquidacion.folio,
        fechaEmision: liquidacion.fechaEmision,
        rutEmisor: rutSii(liquidacion.emisor.rut, 'emisor'),
        rutReceptor: rutSii(liquidacion.receptor.rut, 'receptor'),
        razonSocialReceptor: liquidacion.receptor.razonSocial,
        montoTotal: totales.total,
        primerItem: liquidacion.items[0].nombre,
    };
}

function construirReceptor(receptor: Receptor): XmlElement {
    return fields('Receptor', [
        ['RUTRecep', rutSii(receptor.rut, 'receptor')],
        ['RznSocRecep', receptor.razonSocial],
        ['GiroRecep', receptor.giro],
        ['Contacto', receptor.contacto],
        ['CorreoRecep', receptor.correo],
        ['DirRecep', receptor.direccion],
        ['CmnaRecep', receptor.comuna],
        ['CiudadRecep', receptor.ciudad],
    ]);
}

function construirTotales(totales: TotalesLiquidacion): XmlElement {
    const hayAfecto = totales.neto > 0;
    const hayComisiones = totales.comisionNeto + totales.comisionExento > 0;

    return el('Totales', undefined, [
        ...textElements([
            ['MntNeto', hayAfecto ? totales.neto : undefined],
            ['MntExe', totales.exento > 0 ? totales.exento : undefined],
            ['TasaIVA', hayAfecto ? TASA_IVA : undefined],
            ['IVA', hayAfecto ? totales.iva : undefined],
        ]),
        ...(hayComisiones
            ? [
                  fields('Comisiones', [
                      ['ValComNeto', totales.comisionNeto],
                      ['ValComExe', totales.comisionExento],
                      ['ValComIVA', totales.comisionIva],
                  ]),
              ]
            : []),
        el('MntTotal', undefined, [String(totales.total)]),
    ]);
}

function construirComision(comision: Comision, numero: number): XmlElement {
    const calculada = calcularComision(comision);

    return fields('Comisiones', [
        ['NroLinCom', numero],
        ['TipoMovim', comision.tipo === 'comision' ? 'C' : 'O'],
        ['Glosa', comision.glosa],
        ['TasaComision', decimal(comision.tasa, 2)],
        ['ValComNeto', calculada.neto],
        ['ValComExe', calculada.exento],
        ['ValComIVA', calculada.iva > 0 ? calculada.iva : undefined],
    ]);
}
