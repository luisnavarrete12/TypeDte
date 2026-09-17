import { deepStrictEqual, ok, strictEqual, throws } from 'node:assert/strict';
import { describe, it } from 'node:test';

import { PDFDocument } from 'pdf-lib';

import { parseCaf } from '../src/adapters/caf/parse.ts';
import { formatearMonto, formatearRut, generarPdfCarta, imprimible } from '../src/adapters/pdf/carta.ts';
import { bytesDelTimbre, dibujarTimbre, leerTimbre } from '../src/adapters/pdf/timbre.ts';
import { timbrar } from '../src/adapters/ted/timbrar.ts';
import { datosTimbreBoleta } from '../src/core/dte/boleta.ts';
import { datosTimbre } from '../src/core/dte/documento.ts';
import { datosTimbreExportacion } from '../src/core/dte/exportacion.ts';
import {
    TIPO,
    TIPO_BOLETA,
    TIPO_EXPORTACION,
    type BoletaAfecta,
    type FacturaAfecta,
    type FacturaExportacion,
} from '../src/core/dte/tipos.ts';
import { calcularTotales, calcularTotalesBoleta, calcularTotalesExportacion } from '../src/core/dte/totales.ts';
import { construirRepresentacion, nombreDocumento } from '../src/core/pdf/representacion.ts';
import { generarCafFalso } from './support/caf-falso.ts';
import { EMISION, EMISOR, RECEPTOR, TIMBRADO } from './support/emitir.ts';

const OPCIONES = { unidadSii: 'SANTIAGO ORIENTE', resolucion: { numero: 80, fecha: '2014-08-22' } } as const;

const FACTURA: FacturaAfecta = {
    tipo: TIPO.FACTURA_AFECTA,
    folio: 1284,
    fechaEmision: EMISION,
    emisor: EMISOR,
    receptor: { ...RECEPTOR, razonSocial: 'PANADERÍA Y PASTELERÍA ÑUÑOA' },
    items: [
        { nombre: 'Marraqueta', cantidad: 120, precioUnitario: 180 },
        { nombre: 'Despacho', monto: 15000, exento: true },
    ],
};

function tedDe(factura: FacturaAfecta) {
    const caf = parseCaf(generarCafFalso({ rutEmisor: EMISOR.rut, tipoDte: factura.tipo, folioHasta: 5000 }));

    return timbrar(datosTimbre(factura), caf, TIMBRADO);
}

describe('timbre PDF417', () => {
    it('se lee de vuelta identico al TED firmado, acentos incluidos', async () => {
        const ted = tedDe(FACTURA);
        const leido = await leerTimbre(await dibujarTimbre(ted));

        ok(leido !== null, 'el timbre no se pudo leer');
        deepStrictEqual(Buffer.from(leido), Buffer.from(bytesDelTimbre(ted)));
    });

    it('lo que va adentro son bytes latin-1, no UTF-8', () => {
        const bytes = Buffer.from(bytesDelTimbre(tedDe(FACTURA)));

        // En latin-1 la Ñ es un solo byte (0xD1). En UTF-8 serian dos (0xC3 0x91).
        ok(bytes.includes(0xd1), 'no encontro la Ñ como byte latin-1');
        ok(!bytes.includes(Buffer.from([0xc3, 0x91])), 'el timbre quedo en UTF-8');
    });
});

describe('representacion impresa', () => {
    it('solo muestra las filas de totales que tienen algo', () => {
        const representacion = construirRepresentacion(FACTURA, calcularTotales(FACTURA), tedDe(FACTURA), OPCIONES);
        const etiquetas = representacion.totales.map((fila) => fila.etiqueta);

        deepStrictEqual(etiquetas, ['Monto neto', 'Monto exento', 'IVA 19%', 'TOTAL']);
        ok(representacion.totales.at(-1)?.destacada);
    });

    it('lleva la resolucion con su año y la oficina del SII', () => {
        const representacion = construirRepresentacion(FACTURA, calcularTotales(FACTURA), tedDe(FACTURA), OPCIONES);

        deepStrictEqual(representacion.resolucion, { numero: 80, anio: 2014 });
        strictEqual(representacion.unidadSii, 'SANTIAGO ORIENTE');
    });

    it('conoce el nombre impreso de los 12 tipos', () => {
        for (const tipo of [33, 34, 39, 41, 43, 46, 52, 56, 61, 110, 111, 112]) {
            ok(nombreDocumento(tipo).endsWith('ELECTRÓNICA'), `tipo ${tipo}`);
        }
        throws(() => nombreDocumento(99));
    });

    it('una boleta a consumidor final no inventa receptor', () => {
        const boleta: BoletaAfecta = {
            tipo: TIPO_BOLETA.AFECTA,
            folio: 5,
            fechaEmision: EMISION,
            emisor: EMISOR,
            items: [{ nombre: 'Pan', monto: 1190 }],
        };
        const caf = parseCaf(generarCafFalso({ rutEmisor: EMISOR.rut, tipoDte: 39 }));
        const totales = calcularTotalesBoleta(boleta);
        const representacion = construirRepresentacion(boleta, totales, timbrar(datosTimbreBoleta(boleta), caf, TIMBRADO), OPCIONES);

        strictEqual(representacion.receptor, undefined);
        strictEqual(representacion.moneda, 'PESO CL');
    });

    it('una exportacion se imprime en su moneda', () => {
        const exportacion: FacturaExportacion = {
            tipo: TIPO_EXPORTACION.FACTURA,
            folio: 3,
            fechaEmision: EMISION,
            emisor: EMISOR,
            receptor: { razonSocial: 'ANDES BAKERY LLC' },
            moneda: 'DOLAR USA',
            items: [{ nombre: 'Pan congelado', cantidad: 1200, precioUnitario: 1.85 }],
        };
        const caf = parseCaf(generarCafFalso({ rutEmisor: EMISOR.rut, tipoDte: 110 }));
        const totales = calcularTotalesExportacion(exportacion);
        const representacion = construirRepresentacion(
            exportacion,
            totales,
            timbrar(datosTimbreExportacion(exportacion), caf, TIMBRADO),
            OPCIONES
        );

        strictEqual(representacion.moneda, 'DOLAR USA');
        strictEqual(formatearMonto(totales.total, representacion.moneda), '2.220 DOLAR USA');
    });
});

describe('PDF carta', () => {
    it('genera un PDF valido de una pagina tamaño carta', async () => {
        const pdf = await generarPdfCarta(construirRepresentacion(FACTURA, calcularTotales(FACTURA), tedDe(FACTURA), OPCIONES));
        const leido = await PDFDocument.load(pdf);

        strictEqual(leido.getPageCount(), 1);
        deepStrictEqual(leido.getPage(0).getSize(), { width: 612, height: 792 });
        strictEqual(leido.getTitle(), 'FACTURA ELECTRÓNICA N° 1284');
    });

    it('pagina cuando el detalle no cabe, sin perder lineas', async () => {
        const larga: FacturaAfecta = {
            ...FACTURA,
            items: Array.from({ length: 60 }, (_, i) => ({ nombre: `Producto ${i + 1}`, cantidad: 1, precioUnitario: 1000 })) as unknown as FacturaAfecta['items'],
        };
        const pdf = await generarPdfCarta(construirRepresentacion(larga, calcularTotales(larga), tedDe(larga), OPCIONES));

        ok((await PDFDocument.load(pdf)).getPageCount() >= 2);
    });

    it('imprime el mismo texto que quedo firmado en el XML', () => {
        strictEqual(imprimible('Arriendo — bodega'), 'Arriendo - bodega');
        strictEqual(imprimible('Ñuñoa'), 'Ñuñoa');
    });

    it('formatea RUT y montos a la chilena', () => {
        strictEqual(formatearRut('44444444-4'), '44.444.444-4');
        strictEqual(formatearMonto(135025, 'PESO CL'), '$ 135.025');
    });
});
