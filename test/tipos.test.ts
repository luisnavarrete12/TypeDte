import { ok, strictEqual, throws } from 'node:assert/strict';
import { describe, it } from 'node:test';

import { validarContraEsquema } from '../src/adapters/schema/validar.ts';
import { verificarTimbre } from '../src/adapters/ted/timbrar.ts';
import { construirDocumento } from '../src/core/dte/documento.ts';
import {
    TIPO,
    type FacturaAfecta,
    type FacturaCompra,
    type FacturaExenta,
    type GuiaDespacho,
    type NotaCredito,
    type NotaDebito,
} from '../src/core/dte/tipos.ts';
import { calcularTotales, DocumentoInvalidoError } from '../src/core/dte/totales.ts';
import { EMISION, EMISOR, emitir, RECEPTOR } from './support/emitir.ts';

const BASE = { folio: 7, fechaEmision: EMISION, emisor: EMISOR, receptor: RECEPTOR } as const;

function validoYTimbrado(emitido: ReturnType<typeof emitir>): void {
    validarContraEsquema(emitido.xml, 'DTE_v10.xsd');
    ok(verificarTimbre(emitido.ted, emitido.caf), 'el timbre no valida');
}

describe('factura afecta (33)', () => {
    it('mezcla lineas afectas y exentas', () => {
        const factura: FacturaAfecta = {
            ...BASE,
            tipo: TIPO.FACTURA_AFECTA,
            items: [
                { nombre: 'Pan amasado', cantidad: 10, precioUnitario: 500 },
                { nombre: 'Flete', monto: 3000, exento: true },
            ],
        };
        const emitido = emitir(factura);

        validoYTimbrado(emitido);
        ok(emitido.xml.includes('<MntNeto>5000</MntNeto><MntExe>3000</MntExe>'));
        ok(emitido.xml.includes('<IndExe>1</IndExe>'));
        strictEqual(emitido.totales.total, 5000 + 950 + 3000);
    });

    it('aplica descuento por linea y descuento global', () => {
        const factura: FacturaAfecta = {
            ...BASE,
            tipo: TIPO.FACTURA_AFECTA,
            items: [{ nombre: 'Harina', cantidad: 10, precioUnitario: 1000, descuentoPorcentaje: 10 }],
            movimientosGlobales: [{ tipo: 'descuento', glosa: 'Cliente frecuente', monto: 1000 }],
            formaPago: 'credito',
            fechaVencimiento: '2026-10-16',
        };
        const emitido = emitir(factura);

        validoYTimbrado(emitido);
        // 10.000 - 10% = 9.000 en la linea, menos 1.000 global = 8.000 de neto.
        strictEqual(emitido.totales.neto, 8000);
        strictEqual(emitido.totales.iva, 1520);
        ok(emitido.xml.includes('<DescuentoMonto>1000</DescuentoMonto>'));
        ok(emitido.xml.includes('<TpoMov>D</TpoMov>'));
        ok(emitido.xml.includes('<FmaPago>2</FmaPago>'));
    });

    it('lleva referencias informativas, como una orden de compra', () => {
        const factura: FacturaAfecta = {
            ...BASE,
            tipo: TIPO.FACTURA_AFECTA,
            items: [{ nombre: 'Tortas', monto: 45000 }],
            referencias: [{ tipoDocumento: 801, folio: 'OC-2231', fecha: '2026-09-10' }],
        };

        validoYTimbrado(emitir(factura));
    });
});

describe('factura exenta (34)', () => {
    it('no tiene neto ni IVA, todo es exento', () => {
        const factura: FacturaExenta = {
            ...BASE,
            tipo: TIPO.FACTURA_EXENTA,
            items: [{ nombre: 'Curso de panaderia', monto: 80000 }],
        };
        const emitido = emitir(factura);

        validoYTimbrado(emitido);
        ok(!emitido.xml.includes('<MntNeto>'));
        ok(!emitido.xml.includes('<IVA>'));
        ok(!emitido.xml.includes('<IndExe>'), 'en una exenta no se marca linea por linea');
        ok(emitido.xml.includes('<MntExe>80000</MntExe>'));
        strictEqual(emitido.totales.total, 80000);
    });
});

describe('factura de compra (46)', () => {
    it('retiene el IVA completo y el total no lo incluye', () => {
        const factura: FacturaCompra = {
            ...BASE,
            tipo: TIPO.FACTURA_COMPRA,
            items: [{ nombre: 'Trigo a granel', cantidad: 500, precioUnitario: 200 }],
        };
        const emitido = emitir(factura);

        validoYTimbrado(emitido);
        ok(emitido.xml.includes('<ImptoReten><TipoImp>15</TipoImp><TasaImp>19</TasaImp><MontoImp>19000</MontoImp></ImptoReten>'));
        strictEqual(emitido.totales.total, 100000);
    });
});

describe('guia de despacho (52)', () => {
    it('lleva el motivo del traslado y los datos de transporte', () => {
        const guia: GuiaDespacho = {
            ...BASE,
            tipo: TIPO.GUIA_DESPACHO,
            indicadorTraslado: 1,
            tipoDespacho: 2,
            transporte: { patente: 'KLJT21', direccionDestino: 'Los Olmos 123', comunaDestino: 'Temuco' },
            items: [{ nombre: 'Pan congelado', cantidad: 40, precioUnitario: 2500 }],
        };
        const emitido = emitir(guia);

        validoYTimbrado(emitido);
        ok(emitido.xml.includes('<TipoDespacho>2</TipoDespacho><IndTraslado>1</IndTraslado>'));
        ok(emitido.xml.includes('<Patente>KLJT21</Patente>'));
    });

    it('un traslado interno puede ir sin montos', () => {
        const guia: GuiaDespacho = {
            ...BASE,
            tipo: TIPO.GUIA_DESPACHO,
            indicadorTraslado: 5,
            items: [{ nombre: 'Hornos a sucursal', cantidad: 2, monto: 0 }],
        };
        const emitido = emitir(guia);

        validoYTimbrado(emitido);
        ok(emitido.xml.includes('<MntTotal>0</MntTotal>'));
    });
});

describe('notas de credito (61) y debito (56)', () => {
    it('una nota de credito anula la factura que referencia', () => {
        const nota: NotaCredito = {
            ...BASE,
            tipo: TIPO.NOTA_CREDITO,
            items: [{ nombre: 'Marraqueta', cantidad: 100, precioUnitario: 1000 }],
            referencias: [
                { tipoDocumento: TIPO.FACTURA_AFECTA, folio: 1, fecha: EMISION, codigo: 'anula', razon: 'Pedido cancelado' },
            ],
        };
        const emitido = emitir(nota);

        validoYTimbrado(emitido);
        ok(emitido.xml.includes('<TpoDocRef>33</TpoDocRef><FolioRef>1</FolioRef>'));
        ok(emitido.xml.includes('<CodRef>1</CodRef>'));
    });

    it('una nota que corrige texto va con montos en cero', () => {
        const nota: NotaCredito = {
            ...BASE,
            tipo: TIPO.NOTA_CREDITO,
            items: [{ nombre: 'Corrige giro del receptor', monto: 0 }],
            referencias: [
                { tipoDocumento: TIPO.FACTURA_AFECTA, folio: 1, fecha: EMISION, codigo: 'corrige_texto', razon: 'Giro mal escrito' },
            ],
        };
        const emitido = emitir(nota);

        validoYTimbrado(emitido);
        strictEqual(emitido.totales.total, 0);
    });

    it('una nota de debito cobra una diferencia', () => {
        const nota: NotaDebito = {
            ...BASE,
            tipo: TIPO.NOTA_DEBITO,
            items: [{ nombre: 'Diferencia de precio', monto: 5000 }],
            referencias: [
                { tipoDocumento: TIPO.FACTURA_AFECTA, folio: 1, fecha: EMISION, codigo: 'corrige_montos' },
            ],
        };

        validoYTimbrado(emitir(nota));
    });
});

describe('errores que se detectan antes de gastar un folio', () => {
    const factura = (items: FacturaAfecta['items'], extra: Partial<FacturaAfecta> = {}): FacturaAfecta => ({
        ...BASE,
        tipo: TIPO.FACTURA_AFECTA,
        items,
        ...extra,
    });

    it('un RUT con digito verificador malo, en cualquier parte del documento', () => {
        // Se prueba el constructor directo: el helper `emitir` genera un CAF con
        // el RUT del emisor, y ese CAF falso reclamaria antes de llegar aca.
        throws(() => construirDocumento(factura([{ nombre: 'X', monto: 1000 }], { receptor: { ...RECEPTOR, rut: '22222222-1' } })), /RUT del receptor no es valido/);
        throws(() => construirDocumento(factura([{ nombre: 'X', monto: 1000 }], { emisor: { ...EMISOR, rut: '44444444-1' } })), /RUT del emisor no es valido/);
    });

    it('acepta el RUT con puntos y lo deja como lo quiere el SII', () => {
        const { xml } = emitir(factura([{ nombre: 'X', monto: 1000 }], { receptor: { ...RECEPTOR, rut: '22.222.222-2' } }));

        ok(xml.includes('<RUTRecep>22222222-2</RUTRecep>'));
        ok(xml.includes('<RR>22222222-2</RR>'), 'el timbre quedo con el RUT sin normalizar');
    });

    it('una linea sin monto ni precio', () => {
        throws(() => calcularTotales(factura([{ nombre: 'Algo' }])), /necesita monto/);
    });

    it('descuento en monto y porcentaje a la vez', () => {
        throws(
            () => calcularTotales(factura([{ nombre: 'X', cantidad: 1, precioUnitario: 100, descuentoMonto: 5, descuentoPorcentaje: 5 }])),
            DocumentoInvalidoError
        );
    });

    it('un descuento global mas grande que el neto', () => {
        throws(
            () => calcularTotales(factura([{ nombre: 'X', monto: 1000 }], { movimientosGlobales: [{ tipo: 'descuento', monto: 5000 }] })),
            /bajo cero/
        );
    });

    it('mas de 60 lineas', () => {
        const items = Array.from({ length: 61 }, (_, i) => ({ nombre: `Item ${i}`, monto: 100 }));

        throws(() => calcularTotales(factura(items as unknown as FacturaAfecta['items'])), /hasta 60/);
    });

    it('redondea el IVA como el SII: al peso mas cercano', () => {
        // 1.234 * 19% = 234,46 -> 234.
        strictEqual(calcularTotales(factura([{ nombre: 'X', monto: 1234 }])).iva, 234);
        // 1.237 * 19% = 235,03 -> 235.
        strictEqual(calcularTotales(factura([{ nombre: 'X', monto: 1237 }])).iva, 235);
    });

    it('no emite ruido de punto flotante en cantidades', () => {
        const { xml } = emitir(factura([{ nombre: 'Queso', cantidad: 0.1 + 0.2, precioUnitario: 10000 }]));

        ok(xml.includes('<QtyItem>0.3</QtyItem>'));
    });
});
