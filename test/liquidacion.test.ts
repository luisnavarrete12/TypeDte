import { ok, strictEqual, throws } from 'node:assert/strict';
import { describe, it } from 'node:test';

import { parseCaf } from '../src/adapters/caf/parse.ts';
import { cargarCertificado } from '../src/adapters/crypto/certificado.ts';
import { firmarDocumento } from '../src/adapters/firma/firmar.ts';
import { validarContraEsquema } from '../src/adapters/schema/validar.ts';
import { timbrar, verificarTimbre } from '../src/adapters/ted/timbrar.ts';
import { agregarTimbre, envolverDte, idDocumento } from '../src/core/dte/documento.ts';
import { construirLiquidacion, datosTimbreLiquidacion } from '../src/core/dte/liquidacion.ts';
import { TIPO, TIPO_LIQUIDACION_FACTURA, type LiquidacionFactura } from '../src/core/dte/tipos.ts';
import { calcularTotalesLiquidacion, DocumentoInvalidoError } from '../src/core/dte/totales.ts';
import { serialize, XML_DECLARATION } from '../src/core/xml/serialize.ts';
import { generarCafFalso } from './support/caf-falso.ts';
import { generarCertificadoFalso } from './support/certificado-falso.ts';
import { EMISION, EMISOR, FIRMADO, RECEPTOR, TIMBRADO } from './support/emitir.ts';

function emitirLiquidacion(liquidacion: LiquidacionFactura) {
    const caf = parseCaf(generarCafFalso({ rutEmisor: EMISOR.rut, tipoDte: liquidacion.tipo, folioHasta: 1000 }));
    const { p12, clave } = generarCertificadoFalso();
    const certificado = cargarCertificado(p12, clave);

    const totales = calcularTotalesLiquidacion(liquidacion);
    const ted = timbrar(datosTimbreLiquidacion(liquidacion, totales), caf, TIMBRADO);
    const firmado = firmarDocumento(
        envolverDte(agregarTimbre(construirLiquidacion(liquidacion, totales), ted, FIRMADO)),
        idDocumento(liquidacion.tipo, liquidacion.folio),
        certificado
    );

    return { caf, ted, totales, xml: XML_DECLARATION + serialize(firmado) };
}

const LIQUIDACION: LiquidacionFactura = {
    tipo: TIPO_LIQUIDACION_FACTURA,
    folio: 4,
    fechaEmision: EMISION,
    emisor: EMISOR,
    receptor: RECEPTOR,
    items: [
        { nombre: 'Venta de harina en consignacion', cantidad: 200, precioUnitario: 1000, tipoDocumentoLiquidado: TIPO.FACTURA_AFECTA },
    ],
    referencias: [{ tipoDocumento: TIPO.FACTURA_AFECTA, folio: 120, fecha: '2026-09-02', razon: 'Venta a tercero' }],
    comisiones: [
        { tipo: 'comision', glosa: 'Comision por venta', tasa: 10, neto: 20000 },
        { tipo: 'otro_cargo', glosa: 'Bodegaje', neto: 5000 },
    ],
};

describe('liquidacion-factura (43)', () => {
    it('pasa el esquema y el timbre valida', () => {
        const emitida = emitirLiquidacion(LIQUIDACION);

        validarContraEsquema(emitida.xml, 'DTE_v10.xsd');
        ok(verificarTimbre(emitida.ted, emitida.caf));
    });

    it('descuenta las comisiones y su IVA de lo vendido', () => {
        const totales = calcularTotalesLiquidacion(LIQUIDACION);

        // Ventas: 200.000 + 38.000 de IVA = 238.000.
        // Comisiones: 25.000 + 4.750 de IVA = 29.750.
        strictEqual(totales.comisionNeto, 25000);
        strictEqual(totales.comisionIva, 4750);
        strictEqual(totales.total, 238000 - 29750);
    });

    it('lista cada comision y tambien las resume en los totales', () => {
        const { xml } = emitirLiquidacion(LIQUIDACION);

        ok(xml.includes('<TipoMovim>C</TipoMovim><Glosa>Comision por venta</Glosa><TasaComision>10</TasaComision>'));
        ok(xml.includes('<TipoMovim>O</TipoMovim><Glosa>Bodegaje</Glosa>'));
        ok(xml.includes('<Comisiones><ValComNeto>25000</ValComNeto><ValComExe>0</ValComExe><ValComIVA>4750</ValComIVA></Comisiones>'));
    });

    it('el IVA de las lineas cuadra exacto con el del total', () => {
        // Con montos que no dividen justo, calcular el IVA sobre el total daria
        // un peso distinto que sumar el de cada linea.
        const totales = calcularTotalesLiquidacion({
            ...LIQUIDACION,
            comisiones: [
                { tipo: 'comision', glosa: 'A', neto: 1003 },
                { tipo: 'comision', glosa: 'B', neto: 1003 },
            ],
        });

        // 1.003 * 19% = 190,57 -> 191 por linea, 382 en total. Sobre 2.006 serian 381.
        strictEqual(totales.comisionIva, 382);
    });

    it('cada linea dice con que documento se hizo la venta', () => {
        const { xml } = emitirLiquidacion(LIQUIDACION);

        ok(xml.includes('<NroLinDet>1</NroLinDet><TpoDocLiq>33</TpoDocLiq>'));
    });

    it('rechaza comisiones mayores que lo vendido', () => {
        throws(
            () =>
                calcularTotalesLiquidacion({
                    ...LIQUIDACION,
                    comisiones: [{ tipo: 'comision', glosa: 'Excesiva', neto: 500000 }],
                }),
            DocumentoInvalidoError
        );
    });
});
