import { PDFDocument, rgb, StandardFonts, type PDFFont, type PDFImage, type PDFPage } from 'pdf-lib';

import type { Representacion } from '../../core/pdf/representacion.ts';
import { dibujarTimbre } from './timbre.ts';
import {
    envolver,
    formatearFecha,
    formatearMonto,
    formatearNumero,
    formatearRut,
    imprimible,
} from './texto.ts';

const PUNTOS_POR_MM = 72 / 25.4;

export interface OpcionesTicket {
    /** Ancho del papel. Los rollos habituales son de 80 mm y de 58 mm. */
    readonly anchoPapelMm?: number;
    /** Margen a cada lado. En una térmica de 80 mm el área que imprime es de 72 mm. */
    readonly margenMm?: number;
    /** Texto opcional al pie, como una devolución o un mensaje al cliente. */
    readonly pieDePagina?: string;
    /**
     * Columnas del código del timbre. Más columnas lo dejan más bajo, pero con
     * módulos más finos que una impresora térmica puede no alcanzar a marcar.
     * Sin definir, el codificador elige la forma.
     */
    readonly columnasTimbre?: number;
}

/**
 * Renglón ya medido. El ticket se arma primero como lista de renglones y se
 * dibuja después.
 *
 * El papel térmico es un rollo continuo: la altura de la página depende de
 * cuántos productos tenga la venta, así que hay que conocerla antes de crear
 * la página. Medir y dibujar en pasos separados evita dibujar dos veces.
 */
type Renglon =
    | { readonly tipo: 'texto'; readonly texto: string; readonly tamano: number; readonly negrita: boolean; readonly centrado: boolean }
    | { readonly tipo: 'columnas'; readonly izquierda: string; readonly derecha: string; readonly tamano: number; readonly negrita: boolean }
    | { readonly tipo: 'separador' }
    | { readonly tipo: 'espacio'; readonly alto: number }
    | { readonly tipo: 'imagen'; readonly imagen: PDFImage; readonly ancho: number };

interface Fuentes {
    readonly normal: PDFFont;
    readonly negrita: PDFFont;
}

/**
 * Genera el comprobante para impresora térmica de rollo.
 *
 * Es el formato con el que se imprime una boleta en el mesón. A diferencia de
 * la carta, no hay tabla de columnas: no caben. Cada producto ocupa dos
 * renglones, el nombre arriba y la cantidad y el total abajo.
 */
export async function generarPdfTicket(
    representacion: Representacion,
    opciones: OpcionesTicket = {}
): Promise<Uint8Array> {
    const anchoPapel = (opciones.anchoPapelMm ?? 80) * PUNTOS_POR_MM;
    const margen = (opciones.margenMm ?? 4) * PUNTOS_POR_MM;
    const ancho = anchoPapel - margen * 2;

    const pdf = await PDFDocument.create();
    pdf.setTitle(`${representacion.nombreDocumento} N° ${representacion.folio}`);
    pdf.setCreator('typeDTE');

    const fuentes: Fuentes = {
        normal: await pdf.embedFont(StandardFonts.Helvetica),
        negrita: await pdf.embedFont(StandardFonts.HelveticaBold),
    };
    const timbre = await pdf.embedPng(await dibujarTimbre(representacion.ted, opciones.columnasTimbre));

    const renglones = armarRenglones(representacion, opciones, fuentes, timbre, ancho);
    const alto = renglones.reduce((total, renglon) => total + altoDe(renglon), 0) + margen * 2;

    dibujar(pdf.addPage([anchoPapel, alto]), renglones, fuentes, margen, ancho, alto);

    return pdf.save();
}

function armarRenglones(
    r: Representacion,
    opciones: OpcionesTicket,
    fuentes: Fuentes,
    timbre: PDFImage,
    ancho: number
): Renglon[] {
    const texto = (t: string, tamano: number, negrita = false, centrado = true): Renglon => ({
        tipo: 'texto',
        texto: imprimible(t),
        tamano,
        negrita,
        centrado,
    });
    const envueltos = (t: string, tamano: number, negrita = false, centrado = true): Renglon[] =>
        envolver(imprimible(t), negrita ? fuentes.negrita : fuentes.normal, tamano, ancho).map((linea) =>
            texto(linea, tamano, negrita, centrado)
        );

    const receptor = r.receptor;
    const datosReceptor =
        receptor === undefined
            ? []
            : [
                  ...(receptor.rut === undefined ? [] : [texto(`R.U.T.: ${formatearRut(receptor.rut)}`, 7)]),
                  ...(receptor.razonSocial === undefined ? [] : envueltos(receptor.razonSocial, 7)),
                  ...(receptor.direccion === undefined ? [] : envueltos(receptor.direccion, 7)),
                  { tipo: 'separador' } as Renglon,
              ];

    return [
        ...envueltos(r.emisor.razonSocial, 9, true),
        ...(r.emisor.giro === undefined ? [] : envueltos(r.emisor.giro, 7)),
        ...(r.emisor.direccion === undefined ? [] : envueltos([r.emisor.direccion, r.emisor.comuna].filter(Boolean).join(', '), 7)),
        texto(`R.U.T.: ${formatearRut(r.emisor.rut)}`, 8, true),
        { tipo: 'separador' },
        ...envueltos(r.nombreDocumento, 8, true),
        texto(`N° ${r.folio}`, 9, true),
        texto(formatearFecha(r.fechaEmision), 7),
        { tipo: 'separador' },
        ...datosReceptor,
        ...r.lineas.flatMap((linea) => renglonesDeLinea(linea, r, fuentes, ancho)),
        { tipo: 'separador' },
        ...r.totales.map(
            (fila): Renglon => ({
                tipo: 'columnas',
                izquierda: imprimible(fila.etiqueta),
                derecha: (fila.resta ? '- ' : '') + formatearMonto(fila.valor, r.moneda),
                tamano: fila.destacada ? 10 : 7.5,
                negrita: fila.destacada === true,
            })
        ),
        { tipo: 'separador' },
        { tipo: 'imagen', imagen: timbre, ancho },
        { tipo: 'espacio', alto: 4 },
        texto('Timbre Electrónico SII', 6),
        texto(`Res. N° ${r.resolucion.numero} de ${r.resolucion.anio}`, 6),
        texto('Verifique documento: www.sii.cl', 6),
        ...(opciones.pieDePagina === undefined
            ? []
            : [{ tipo: 'espacio', alto: 6 } as Renglon, ...envueltos(opciones.pieDePagina, 6.5)]),
    ];
}

/**
 * Un producto ocupa dos renglones cuando hay cantidad y precio que mostrar:
 * el nombre arriba y `2 UN x $ 1.890` abajo, con el total a la derecha. Si
 * solo hay un monto, el nombre y el monto comparten renglón.
 */
function renglonesDeLinea(
    linea: Representacion['lineas'][number],
    r: Representacion,
    fuentes: Fuentes,
    ancho: number
): Renglon[] {
    const tamano = 7.5;
    const nombre = imprimible(linea.exento ? `${linea.nombre} (exento)` : linea.nombre);
    const monto = formatearMonto(linea.monto, r.moneda);
    const cantidad = detalleDeCantidad(linea, r);
    const lineas = envolver(nombre, fuentes.normal, tamano, ancho - (cantidad === '' ? fuentes.normal.widthOfTextAtSize(monto, tamano) + 8 : 0));

    const comoTexto = (texto: string): Renglon => ({ tipo: 'texto', texto, tamano, negrita: false, centrado: false });
    const columnas = (izquierda: string): Renglon => ({ tipo: 'columnas', izquierda, derecha: monto, tamano, negrita: false });

    if (cantidad === '') {
        return [...lineas.slice(0, -1).map(comoTexto), columnas(lineas.at(-1) ?? nombre)];
    }

    return [...lineas.map(comoTexto), columnas(imprimible(cantidad))];
}

/** La línea de cantidad solo aparece cuando hay cantidad y precio que mostrar. */
function detalleDeCantidad(linea: Representacion['lineas'][number], r: Representacion): string {
    if (linea.cantidad === undefined || linea.precioUnitario === undefined) {
        return '';
    }

    const unidad = linea.unidad === undefined ? '' : ` ${linea.unidad}`;

    return `${formatearNumero(linea.cantidad, 6)}${unidad} x ${formatearMonto(linea.precioUnitario, r.moneda, 6)}`;
}

function altoDe(renglon: Renglon): number {
    switch (renglon.tipo) {
        case 'texto':
            return renglon.tamano * 1.35;
        case 'columnas':
            return renglon.tamano * 1.45;
        case 'separador':
            return 7;
        case 'espacio':
            return renglon.alto;
        case 'imagen':
            return (renglon.imagen.height / renglon.imagen.width) * renglon.ancho + 4;
    }
}

function dibujar(
    pagina: PDFPage,
    renglones: readonly Renglon[],
    fuentes: Fuentes,
    margen: number,
    ancho: number,
    alto: number
): void {
    let y = alto - margen;

    for (const renglon of renglones) {
        y -= altoDe(renglon);

        if (renglon.tipo === 'separador') {
            pagina.drawLine({
                start: { x: margen, y: y + 3 },
                end: { x: margen + ancho, y: y + 3 },
                thickness: 0.5,
                color: rgb(0.6, 0.6, 0.6),
            });
            continue;
        }

        if (renglon.tipo === 'imagen') {
            pagina.drawImage(renglon.imagen, {
                x: margen,
                y: y + 4,
                width: ancho,
                height: (renglon.imagen.height / renglon.imagen.width) * ancho,
            });
            continue;
        }

        if (renglon.tipo === 'texto') {
            const fuente = renglon.negrita ? fuentes.negrita : fuentes.normal;
            const x = renglon.centrado
                ? margen + (ancho - fuente.widthOfTextAtSize(renglon.texto, renglon.tamano)) / 2
                : margen;

            pagina.drawText(renglon.texto, { x, y, size: renglon.tamano, font: fuente });
            continue;
        }

        if (renglon.tipo === 'columnas') {
            const fuente = renglon.negrita ? fuentes.negrita : fuentes.normal;

            pagina.drawText(renglon.izquierda, { x: margen, y, size: renglon.tamano, font: fuente });
            pagina.drawText(renglon.derecha, {
                x: margen + ancho - fuente.widthOfTextAtSize(renglon.derecha, renglon.tamano),
                y,
                size: renglon.tamano,
                font: fuente,
            });
        }
    }
}
