import { ok, strictEqual } from 'node:assert/strict';
import { describe, it } from 'node:test';

import { cargarCertificado } from '../src/adapters/crypto/certificado.ts';
import { firmarDocumento, verificarFirma } from '../src/adapters/firma/firmar.ts';
import { validarContraEsquema } from '../src/adapters/schema/validar.ts';
import { TIPO, TIPO_BOLETA, type FacturaAfecta, type GuiaDespacho, type NotaCredito } from '../src/core/dte/tipos.ts';
import { calcularTotales, calcularTotalesBoleta } from '../src/core/dte/totales.ts';
import { construirLibroCompraVenta, ID_ENVIO_LIBRO, lineaVentaDesde } from '../src/core/libro/compra-venta.ts';
import { construirLibroGuias, lineaGuiaDesde } from '../src/core/libro/guias.ts';
import type { CaratulaLibro, LibroCompraVenta } from '../src/core/libro/tipos.ts';
import type { XmlElement } from '../src/core/xml/node.ts';
import { serialize, XML_DECLARATION } from '../src/core/xml/serialize.ts';
import { generarCertificadoFalso } from './support/certificado-falso.ts';
import { EMISION, EMISOR, RECEPTOR } from './support/emitir.ts';

const CARATULA: CaratulaLibro = {
    rutEmisor: EMISOR.rut,
    rutEnvia: '11111111-1',
    periodo: '2026-09',
    fechaResolucion: '2026-01-01',
    numeroResolucion: 0,
    timestampFirma: '2026-10-01T09:00:00',
};

function firmar(libro: XmlElement) {
    const { p12, clave } = generarCertificadoFalso();
    const certificado = cargarCertificado(p12, clave);
    const firmado = firmarDocumento(libro, ID_ENVIO_LIBRO, certificado);

    return { certificado, firmado, xml: XML_DECLARATION + serialize(firmado) };
}

describe('libro de ventas', () => {
    const factura: FacturaAfecta = {
        tipo: TIPO.FACTURA_AFECTA,
        folio: 1,
        fechaEmision: EMISION,
        emisor: EMISOR,
        receptor: RECEPTOR,
        items: [{ nombre: 'Pan', cantidad: 100, precioUnitario: 1000 }, { nombre: 'Flete', monto: 2000, exento: true }],
    };
    const otraFactura: FacturaAfecta = { ...factura, folio: 2, items: [{ nombre: 'Torta', monto: 50000 }] };
    const nota: NotaCredito = {
        ...factura,
        tipo: TIPO.NOTA_CREDITO,
        folio: 1,
        items: [{ nombre: 'Devolucion', monto: 10000 }],
        referencias: [{ tipoDocumento: TIPO.FACTURA_AFECTA, folio: 1, fecha: EMISION, codigo: 'corrige_montos' }],
    };

    const libro: LibroCompraVenta = {
        operacion: 'venta',
        caratula: CARATULA,
        lineas: [
            lineaVentaDesde(factura, calcularTotales(factura)),
            lineaVentaDesde(otraFactura, calcularTotales(otraFactura)),
            lineaVentaDesde(nota, calcularTotales(nota)),
        ],
    };

    it('pasa el esquema oficial y la firma valida', () => {
        const { xml, firmado, certificado } = firmar(construirLibroCompraVenta(libro));

        validarContraEsquema(xml, 'LibroCV_v10.xsd');
        ok(verificarFirma(firmado, ID_ENVIO_LIBRO, certificado));
    });

    it('resume por tipo de documento sumando desde el detalle', () => {
        const { xml } = firmar(construirLibroCompraVenta(libro));

        // Dos facturas: 100.000 + 50.000 de neto, 2.000 exento.
        ok(xml.includes('<TpoDoc>33</TpoDoc><TotDoc>2</TotDoc><TotOpExe>1</TotOpExe><TotMntExe>2000</TotMntExe><TotMntNeto>150000</TotMntNeto><TotMntIVA>28500</TotMntIVA>'));
        ok(xml.includes('<TotMntTotal>180500</TotMntTotal>'));
        ok(xml.includes('<TpoDoc>61</TpoDoc><TotDoc>1</TotDoc>'));
    });

    it('toma los montos de lo emitido, asi el libro no puede discrepar', () => {
        const linea = lineaVentaDesde(factura, calcularTotales(factura));

        strictEqual(linea.neto, 100000);
        strictEqual(linea.exento, 2000);
        strictEqual(linea.total, calcularTotales(factura).total);
    });

    it('las boletas van solo en el resumen, no linea por linea', () => {
        const boleta = { tipo: TIPO_BOLETA.AFECTA, folio: 9, fechaEmision: EMISION, emisor: EMISOR, items: [{ nombre: 'Pan', monto: 1190 }] } as const;
        const { xml } = firmar(
            construirLibroCompraVenta({ ...libro, lineas: [...libro.lineas, lineaVentaDesde(boleta, calcularTotalesBoleta(boleta))] })
        );

        validarContraEsquema(xml, 'LibroCV_v10.xsd');
        ok(xml.includes('<TpoDoc>39</TpoDoc><TotDoc>1</TotDoc>'));
        ok(!xml.includes('<Detalle><TpoDoc>39</TpoDoc>'), 'detallo una boleta');
    });

    it('un documento anulado cuenta en el resumen pero no suma montos', () => {
        const { xml } = firmar(
            construirLibroCompraVenta({
                ...libro,
                lineas: [...libro.lineas, { tipoDocumento: 33, folio: 3, fecha: EMISION, rut: RECEPTOR.rut, razonSocial: 'X', anulado: true }],
            })
        );

        validarContraEsquema(xml, 'LibroCV_v10.xsd');
        ok(xml.includes('<TpoDoc>33</TpoDoc><TotDoc>3</TotDoc><TotAnulado>1</TotAnulado>'));
        ok(xml.includes('<Detalle><TpoDoc>33</TpoDoc><NroDoc>3</NroDoc><Anulado>A</Anulado></Detalle>'));
    });
});

describe('libro de compras', () => {
    const libro: LibroCompraVenta = {
        operacion: 'compra',
        caratula: CARATULA,
        factorProporcionalidad: 0.6,
        lineas: [
            { tipoDocumento: 33, folio: 781, fecha: '2026-09-03', rut: '33333333-3', razonSocial: 'MOLINOS DEL SUR SA', neto: 200000, iva: 38000 },
            { tipoDocumento: 33, folio: 782, fecha: '2026-09-05', rut: '33333333-3', razonSocial: 'MOLINOS DEL SUR SA', neto: 50000, iva: 9500, ivaUsoComun: 9500 },
            { tipoDocumento: 33, folio: 99, fecha: '2026-09-08', rut: '77777777-7', razonSocial: 'AUTOMOTORA LTDA', neto: 30000, iva: 5700, ivaNoRecuperable: [{ codigo: 4, monto: 5700 }] },
            { tipoDocumento: 46, folio: 12, fecha: '2026-09-10', rut: '12345678-5', razonSocial: 'JUAN AGRICULTOR', neto: 80000, iva: 15200, ivaRetenidoTotal: 15200 },
            { tipoDocumento: 61, folio: 45, fecha: '2026-09-12', rut: '33333333-3', razonSocial: 'MOLINOS DEL SUR SA', neto: 10000, iva: 1900 },
        ],
    };

    it('pasa el esquema oficial', () => {
        validarContraEsquema(firmar(construirLibroCompraVenta(libro)).xml, 'LibroCV_v10.xsd');
    });

    it('resume el IVA de uso comun con el factor de proporcionalidad', () => {
        const { xml } = firmar(construirLibroCompraVenta(libro));

        // 9.500 de IVA de uso comun x 0,6 = 5.700 de credito.
        ok(xml.includes('<TotOpIVAUsoComun>1</TotOpIVAUsoComun><TotIVAUsoComun>9500</TotIVAUsoComun><FctProp>0.6</FctProp><TotCredIVAUsoComun>5700</TotCredIVAUsoComun>'));
    });

    it('agrupa el IVA no recuperable por codigo', () => {
        const { xml } = firmar(construirLibroCompraVenta(libro));

        ok(xml.includes('<TotIVANoRec><CodIVANoRec>4</CodIVANoRec><TotOpIVANoRec>1</TotOpIVANoRec><TotMntIVANoRec>5700</TotMntIVANoRec></TotIVANoRec>'));
    });

    it('la factura de compra resta el IVA retenido del total', () => {
        const { xml } = firmar(construirLibroCompraVenta(libro));

        ok(xml.includes('<TotOpIVARetTotal>1</TotOpIVARetTotal><TotIVARetTotal>15200</TotIVARetTotal><TotMntTotal>80000</TotMntTotal>'));
    });
});

describe('libro de guias', () => {
    const guia = (folio: number, indicadorTraslado: GuiaDespacho['indicadorTraslado'], monto: number): GuiaDespacho => ({
        tipo: TIPO.GUIA_DESPACHO,
        folio,
        fechaEmision: EMISION,
        emisor: EMISOR,
        receptor: RECEPTOR,
        indicadorTraslado,
        items: [{ nombre: 'Mercaderia', monto }],
    });

    const guias = [guia(1, 1, 100000), guia(2, 1, 40000), guia(3, 5, 0), guia(4, 3, 25000)];

    it('pasa el esquema oficial', () => {
        const libro = construirLibroGuias({
            caratula: CARATULA,
            folioNotificacion: 1,
            lineas: [
                ...guias.map((g) => lineaGuiaDesde(g, calcularTotales(g))),
                { folio: 5, fecha: EMISION, rut: RECEPTOR.rut, razonSocial: RECEPTOR.razonSocial, indicadorTraslado: 1, anulada: 'antes_de_enviar' },
            ],
        });

        validarContraEsquema(firmar(libro).xml, 'LibroGuia_v10.xsd');
    });

    it('separa las guias de venta de los traslados que no son venta', () => {
        const { xml } = firmar(
            construirLibroGuias({ caratula: CARATULA, folioNotificacion: 1, lineas: guias.map((g) => lineaGuiaDesde(g, calcularTotales(g))) })
        );

        // Dos de venta: (100.000 + 40.000) con IVA.
        ok(xml.includes('<TotGuiaVenta>2</TotGuiaVenta><TotMntGuiaVta>166600</TotMntGuiaVta>'));
        ok(xml.includes('<TotTraslado><TpoTraslado>3</TpoTraslado><CantGuia>1</CantGuia>'));
        ok(xml.includes('<TotTraslado><TpoTraslado>5</TpoTraslado><CantGuia>1</CantGuia><MntGuia>0</MntGuia></TotTraslado>'));
    });
});
