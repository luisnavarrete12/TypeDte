import { el, fields, textElements, type FieldEntry, type XmlElement } from '../xml/node.ts';
import { formatRut, RutInvalidoError } from '../rut/rut.ts';
import { decimal } from './formato.ts';
import type { CodigoReferencia, Emisor, FormaPago, Referencia } from './tipos.ts';
import { DocumentoInvalidoError, type LineaCalculada, type MovimientoCalculado } from './totales.ts';

/**
 * Piezas que comparten facturas, boletas y exportaciones. Los esquemas
 * repiten estos nodos con la misma forma, asi que se arman en un solo lugar.
 */

export const FORMA_PAGO: Readonly<Record<FormaPago, number>> = {
    contado: 1,
    credito: 2,
    sin_costo: 3,
};

const CODIGO_REFERENCIA: Readonly<Record<CodigoReferencia, number>> = {
    anula: 1,
    corrige_texto: 2,
    corrige_montos: 3,
};

/**
 * Valida el RUT y lo deja en la forma que exige el SII: sin puntos, con guion
 * y K mayuscula. Un RUT con digito verificador malo es un rechazo seguro, asi
 * que se detecta aca y no despues de gastar el folio.
 */
export function rutSii(rut: string, campo: string): string {
    try {
        return formatRut(rut);
    } catch (error) {
        if (error instanceof RutInvalidoError) {
            throw new DocumentoInvalidoError(`El RUT del ${campo} no es valido: ${error.message}`);
        }
        throw error;
    }
}

/** Emisor con los nombres de campo de facturas y exportaciones. */
export function construirEmisor(emisor: Emisor): XmlElement {
    return el('Emisor', undefined, [
        ...textElements([
            ['RUTEmisor', rutSii(emisor.rut, 'emisor')],
            ['RznSoc', emisor.razonSocial],
            ['GiroEmis', emisor.giro],
            ['Telefono', emisor.telefono],
            ['CorreoEmisor', emisor.correo],
        ]),
        ...textElements(emisor.actividadesEconomicas.map((codigo): FieldEntry => ['Acteco', codigo])),
        ...textElements([
            ['CdgSIISucur', emisor.codigoSucursal],
            ['DirOrigen', emisor.direccion],
            ['CmnaOrigen', emisor.comuna],
            ['CiudadOrigen', emisor.ciudad],
        ]),
    ]);
}

/**
 * Una linea de detalle.
 *
 * `marcarExento` distingue una linea exenta dentro de un documento afecto. En
 * un documento completamente exento no se marca linea por linea.
 */
export function construirDetalle(
    linea: LineaCalculada,
    numero: number,
    marcarExento: boolean,
    tipoDocumentoLiquidado?: number
): XmlElement {
    const { item } = linea;

    return fields('Detalle', [
        ['NroLinDet', numero],
        ['TpoDocLiq', tipoDocumentoLiquidado],
        ['IndExe', marcarExento ? 1 : undefined],
        ['NmbItem', item.nombre],
        ['DscItem', item.descripcion],
        ['QtyItem', decimal(item.cantidad)],
        ['UnmdItem', item.unidad],
        ['PrcItem', decimal(item.precioUnitario)],
        ['DescuentoPct', decimal(item.descuentoPorcentaje)],
        ['DescuentoMonto', linea.descuento > 0 ? decimal(linea.descuento, 4) : undefined],
        ['MontoItem', decimal(linea.monto, 4)],
    ]);
}

/**
 * Un descuento o recargo global.
 *
 * @param decimalesPorcentaje las boletas admiten un solo decimal en el valor;
 *   los demas documentos, dos.
 */
export function construirMovimiento(
    { movimiento, monto }: MovimientoCalculado,
    numero: number,
    decimalesPorcentaje = 2
): XmlElement {
    const enPorcentaje = movimiento.porcentaje !== undefined;

    return fields('DscRcgGlobal', [
        ['NroLinDR', numero],
        ['TpoMov', movimiento.tipo === 'descuento' ? 'D' : 'R'],
        ['GlosaDR', movimiento.glosa],
        ['TpoValor', enPorcentaje ? '%' : '$'],
        ['ValorDR', enPorcentaje ? decimal(movimiento.porcentaje, decimalesPorcentaje) : decimal(monto, 4)],
    ]);
}

/** Referencia a otro documento, con la forma de facturas, notas y exportaciones. */
export function construirReferencia(referencia: Referencia, numero: number): XmlElement {
    return fields('Referencia', [
        ['NroLinRef', numero],
        ['TpoDocRef', referencia.tipoDocumento],
        ['FolioRef', referencia.folio],
        ['FchRef', referencia.fecha],
        ['CodRef', referencia.codigo === undefined ? undefined : CODIGO_REFERENCIA[referencia.codigo]],
        ['RazonRef', referencia.razon],
    ]);
}
