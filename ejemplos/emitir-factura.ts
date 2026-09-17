/**
 * Emite una factura de punta a punta con credenciales de prueba y deja el XML
 * firmado y el PDF en `ejemplos/salida/`.
 *
 *     npm run ejemplo
 *
 * El CAF y el certificado son falsos: se generan al vuelo para poder correr
 * esto sin tramites. Con credenciales reales, lo unico que cambia son las dos
 * lineas marcadas abajo.
 */
import { mkdirSync, writeFileSync } from 'node:fs';

import { cargarCertificado, emitir, parseCaf, TIPO, validarContraEsquema, type FacturaAfecta } from '../src/index.ts';
import { construirRepresentacion, generarPdfCarta } from '../src/pdf.ts';
import { generarCafFalso } from '../test/support/caf-falso.ts';
import { generarCertificadoFalso } from '../test/support/certificado-falso.ts';

const factura: FacturaAfecta = {
    tipo: TIPO.FACTURA_AFECTA,
    folio: 1,
    fechaEmision: '2026-09-16',
    emisor: {
        rut: '44.444.444-4',
        razonSocial: 'PANADERÍA ÑUÑOA SPA',
        giro: 'Elaboración de pan',
        actividadesEconomicas: [107100],
        direccion: 'Av. Irarrázaval 1234',
        comuna: 'Ñuñoa',
        ciudad: 'Santiago',
    },
    receptor: {
        rut: '22.222.222-2',
        razonSocial: 'CLIENTE EJEMPLO SPA',
        giro: 'Comercio',
        direccion: 'Los Olmos 123',
        comuna: 'Temuco',
    },
    items: [
        { nombre: 'Marraqueta', cantidad: 120, unidad: 'UN', precioUnitario: 180 },
        { nombre: 'Kuchen de nuez', cantidad: 6, unidad: 'UN', precioUnitario: 8990 },
        { nombre: 'Despacho', monto: 15000, exento: true },
    ],
};

// Con credenciales reales: parseCaf(readFileSync('FoliosSII....xml', 'latin1'))
const caf = parseCaf(generarCafFalso({ rutEmisor: '44444444-4', tipoDte: TIPO.FACTURA_AFECTA }));
// Con credenciales reales: cargarCertificado(readFileSync('certificado.pfx'), process.env.CLAVE_CERTIFICADO)
const { p12, clave } = generarCertificadoFalso();
const certificado = cargarCertificado(p12, clave);

const emitido = emitir(factura, { caf, certificado, timestamp: '2026-09-16T10:30:00' });
validarContraEsquema(emitido.xml, 'DTE_v10.xsd');

const pdf = await generarPdfCarta(
    construirRepresentacion(factura, emitido.totales, emitido.ted, {
        unidadSii: 'SANTIAGO ORIENTE',
        resolucion: { numero: 0, fecha: '2026-01-01' },
    })
);

mkdirSync('ejemplos/salida', { recursive: true });
writeFileSync('ejemplos/salida/factura-1.xml', emitido.xml, 'latin1');
writeFileSync('ejemplos/salida/factura-1.pdf', pdf);

console.log(`Neto    $ ${emitido.totales.neto.toLocaleString('es-CL')}`);
console.log(`Exento  $ ${emitido.totales.exento.toLocaleString('es-CL')}`);
console.log(`IVA     $ ${emitido.totales.iva.toLocaleString('es-CL')}`);
console.log(`Total   $ ${emitido.totales.total.toLocaleString('es-CL')}`);
console.log('\nValida contra el esquema oficial del SII.');
console.log('Escrito en ejemplos/salida/factura-1.xml y factura-1.pdf');
