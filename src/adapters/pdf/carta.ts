import { PDFDocument, rgb, StandardFonts, type PDFFont, type PDFPage } from 'pdf-lib';

import type { LineaImpresa, Representacion } from '../../core/pdf/representacion.ts';
import { formatRut } from '../../core/rut/rut.ts';
import { sanitizeSiiText } from '../../core/xml/text.ts';
import { dibujarTimbre } from './timbre.ts';

const CARTA = { ancho: 612, alto: 792 } as const;
const MARGEN = 36;
const ROJO_SII = rgb(0.8, 0, 0);
const GRIS = rgb(0.45, 0.45, 0.45);
const NEGRO = rgb(0, 0, 0);

/** Alto reservado al pie de la ultima pagina: timbre a la izquierda, totales a la derecha. */
const ALTO_PIE = 190;
const ALTO_FILA = 14;

interface Lienzo {
    readonly pdf: PDFDocument;
    readonly normal: PDFFont;
    readonly negrita: PDFFont;
}

/**
 * Genera la representacion impresa en tamano carta.
 *
 * Sigue lo que el SII exige que aparezca: el recuadro rojo con RUT, tipo y
 * folio, la oficina del SII, el timbre con su leyenda y la resolucion. La
 * diagramacion es sobria a proposito: la mayoria de las empresas va a poner
 * su propio diseno encima.
 */
export async function generarPdfCarta(representacion: Representacion): Promise<Uint8Array> {
    const pdf = await PDFDocument.create();
    pdf.setTitle(`${representacion.nombreDocumento} N° ${representacion.folio}`);
    pdf.setCreator('typeDTE');

    const lienzo: Lienzo = {
        pdf,
        normal: await pdf.embedFont(StandardFonts.Helvetica),
        negrita: await pdf.embedFont(StandardFonts.HelveticaBold),
    };

    let pagina = pdf.addPage([CARTA.ancho, CARTA.alto]);
    let y = dibujarCabecera(pagina, lienzo, representacion);
    y = dibujarReceptor(pagina, lienzo, representacion, y);
    y = dibujarEncabezadoTabla(pagina, lienzo, y);

    for (const [indice, linea] of representacion.lineas.entries()) {
        const esUltima = indice === representacion.lineas.length - 1;
        const reservado = esUltima ? ALTO_PIE + ALTO_FILA * representacion.referencias.length : 0;

        if (y - ALTO_FILA < MARGEN + reservado) {
            pagina = pdf.addPage([CARTA.ancho, CARTA.alto]);
            y = dibujarEncabezadoTabla(pagina, lienzo, CARTA.alto - MARGEN);
        }

        y = dibujarLinea(pagina, lienzo, linea, representacion, y);
    }

    if (y < MARGEN + ALTO_PIE + ALTO_FILA * representacion.referencias.length) {
        pagina = pdf.addPage([CARTA.ancho, CARTA.alto]);
        y = CARTA.alto - MARGEN;
    }

    dibujarReferencias(pagina, lienzo, representacion, y - 10);
    await dibujarPie(pagina, lienzo, representacion);

    return pdf.save();
}

function dibujarCabecera(pagina: PDFPage, lienzo: Lienzo, r: Representacion): number {
    const tope = CARTA.alto - MARGEN;

    // Recuadro del SII, arriba a la derecha.
    const recuadro = { x: CARTA.ancho - MARGEN - 200, y: tope - 90, ancho: 200, alto: 90 };
    pagina.drawRectangle({ ...recuadro, width: recuadro.ancho, height: recuadro.alto, borderColor: ROJO_SII, borderWidth: 2 });

    const centrado = (texto: string, yTexto: number, fuente: PDFFont, tamano: number): void => {
        const ancho = fuente.widthOfTextAtSize(texto, tamano);
        pagina.drawText(texto, { x: recuadro.x + (recuadro.ancho - ancho) / 2, y: yTexto, size: tamano, font: fuente, color: ROJO_SII });
    };

    // El nombre del documento ocupa uno o dos renglones; el bloque completo se
    // centra en el recuadro para que no quede un hueco cuando es corto.
    const nombre = envolver(imprimible(r.nombreDocumento), lienzo.negrita, 10, recuadro.ancho - 16);
    const altoBloque = 13 + 8 + nombre.length * 12 + 8 + 13;
    let yRecuadro = recuadro.y + (recuadro.alto + altoBloque) / 2 - 11;

    centrado(`R.U.T.: ${formatearRut(r.emisor.rut)}`, yRecuadro, lienzo.negrita, 11);
    yRecuadro -= 21;
    for (const renglon of nombre) {
        centrado(renglon, yRecuadro, lienzo.negrita, 10);
        yRecuadro -= 12;
    }
    centrado(`N° ${r.folio}`, yRecuadro - 9, lienzo.negrita, 11);
    centrado(`S.I.I. - ${imprimible(r.unidadSii)}`, tope - 104, lienzo.negrita, 9);

    // Datos del emisor, a la izquierda.
    let y = tope - 12;
    const anchoEmisor = recuadro.x - MARGEN - 16;

    for (const renglon of envolver(imprimible(r.emisor.razonSocial), lienzo.negrita, 13, anchoEmisor)) {
        pagina.drawText(renglon, { x: MARGEN, y, size: 13, font: lienzo.negrita, color: NEGRO });
        y -= 15;
    }

    const datos = [
        r.emisor.giro,
        r.emisor.direccion,
        unirSinRepetir(r.emisor.comuna, r.emisor.ciudad),
        [r.emisor.telefono, r.emisor.correo].filter(Boolean).join(' · '),
    ];

    for (const dato of datos.filter((d): d is string => Boolean(d))) {
        for (const renglon of envolver(imprimible(dato), lienzo.normal, 9, anchoEmisor)) {
            pagina.drawText(renglon, { x: MARGEN, y, size: 9, font: lienzo.normal, color: GRIS });
            y -= 11;
        }
    }

    return Math.min(y, tope - 118) - 8;
}

function dibujarReceptor(pagina: PDFPage, lienzo: Lienzo, r: Representacion, y: number): number {
    const filas: [string, string | undefined][] = [
        ['Fecha emisión', formatearFecha(r.fechaEmision)],
        ['Señor(es)', r.receptor?.razonSocial],
        ['R.U.T.', r.receptor?.rut === undefined ? undefined : formatearRut(r.receptor.rut)],
        ['Giro', r.receptor?.giro],
        ['Dirección', r.receptor?.direccion],
        ['Comuna', unirSinRepetir(r.receptor?.comuna, r.receptor?.ciudad)],
    ];

    const visibles = filas.filter((fila): fila is [string, string] => fila[1] !== undefined && fila[1] !== '');
    const alto = visibles.length * 13 + 10;

    pagina.drawRectangle({ x: MARGEN, y: y - alto, width: CARTA.ancho - 2 * MARGEN, height: alto, borderColor: GRIS, borderWidth: 0.5 });

    let yFila = y - 14;
    for (const [etiqueta, valor] of visibles) {
        pagina.drawText(`${etiqueta}:`, { x: MARGEN + 8, y: yFila, size: 9, font: lienzo.negrita });
        pagina.drawText(recortar(imprimible(valor), lienzo.normal, 9, CARTA.ancho - 2 * MARGEN - 110), {
            x: MARGEN + 90,
            y: yFila,
            size: 9,
            font: lienzo.normal,
        });
        yFila -= 13;
    }

    return y - alto - 14;
}

/** Posicion del borde derecho de cada columna numerica. */
const COLUMNAS = {
    descripcion: MARGEN + 6,
    cantidad: 380,
    precio: 460,
    descuento: 510,
    total: CARTA.ancho - MARGEN - 6,
} as const;

function dibujarEncabezadoTabla(pagina: PDFPage, lienzo: Lienzo, y: number): number {
    pagina.drawRectangle({ x: MARGEN, y: y - 16, width: CARTA.ancho - 2 * MARGEN, height: 16, color: rgb(0.93, 0.93, 0.93) });

    const titulo = { y: y - 11, size: 8, font: lienzo.negrita };
    pagina.drawText('DESCRIPCIÓN', { x: COLUMNAS.descripcion, ...titulo });
    alDerecha(pagina, 'CANT.', COLUMNAS.cantidad, titulo);
    alDerecha(pagina, 'P. UNITARIO', COLUMNAS.precio, titulo);
    alDerecha(pagina, 'DESC.', COLUMNAS.descuento, titulo);
    alDerecha(pagina, 'TOTAL', COLUMNAS.total, titulo);

    return y - 16 - 4;
}

function dibujarLinea(pagina: PDFPage, lienzo: Lienzo, linea: LineaImpresa, r: Representacion, y: number): number {
    const estilo = { y: y - 10, size: 8.5, font: lienzo.normal };
    const nombre = linea.exento ? `${linea.nombre} (exento)` : linea.nombre;

    pagina.drawText(recortar(imprimible(nombre), lienzo.normal, 8.5, COLUMNAS.cantidad - 60 - COLUMNAS.descripcion), {
        x: COLUMNAS.descripcion,
        ...estilo,
    });

    if (linea.cantidad !== undefined) {
        const cantidad = formatearNumero(linea.cantidad, 6) + (linea.unidad ? ` ${imprimible(linea.unidad)}` : '');
        alDerecha(pagina, cantidad, COLUMNAS.cantidad, estilo);
    }
    if (linea.precioUnitario !== undefined) {
        alDerecha(pagina, formatearMonto(linea.precioUnitario, r.moneda, 6), COLUMNAS.precio, estilo);
    }
    if (linea.descuento !== undefined) {
        alDerecha(pagina, formatearMonto(linea.descuento, r.moneda), COLUMNAS.descuento, estilo);
    }
    alDerecha(pagina, formatearMonto(linea.monto, r.moneda), COLUMNAS.total, estilo);

    pagina.drawLine({
        start: { x: MARGEN, y: y - ALTO_FILA },
        end: { x: CARTA.ancho - MARGEN, y: y - ALTO_FILA },
        thickness: 0.3,
        color: rgb(0.85, 0.85, 0.85),
    });

    return y - ALTO_FILA;
}

function dibujarReferencias(pagina: PDFPage, lienzo: Lienzo, r: Representacion, y: number): void {
    if (r.referencias.length === 0) {
        return;
    }

    pagina.drawText('REFERENCIAS', { x: MARGEN, y, size: 8, font: lienzo.negrita });

    r.referencias.forEach((referencia, i) => {
        const partes = [
            referencia.tipoDocumento === undefined ? undefined : `Tipo ${referencia.tipoDocumento}`,
            referencia.codigo,
            referencia.folio === undefined ? undefined : `N° ${referencia.folio}`,
            referencia.fecha === undefined ? undefined : formatearFecha(referencia.fecha),
            referencia.razon,
        ].filter((p): p is string => p !== undefined);

        pagina.drawText(recortar(imprimible(partes.join(' · ')), lienzo.normal, 8, CARTA.ancho - 2 * MARGEN), {
            x: MARGEN,
            y: y - 12 - i * 11,
            size: 8,
            font: lienzo.normal,
        });
    });
}

async function dibujarPie(pagina: PDFPage, lienzo: Lienzo, r: Representacion): Promise<void> {
    // Timbre abajo a la izquierda, con la leyenda que exige el SII.
    const imagen = await lienzo.pdf.embedPng(await dibujarTimbre(r.ted));
    const ancho = 220;
    const alto = (imagen.height / imagen.width) * ancho;
    const base = MARGEN + 36;

    pagina.drawImage(imagen, { x: MARGEN, y: base, width: ancho, height: alto });

    const leyenda = ['Timbre Electrónico SII', `Res. N° ${r.resolucion.numero} de ${r.resolucion.anio}`, 'Verifique documento: www.sii.cl'];
    leyenda.forEach((texto, i) => {
        const anchoTexto = lienzo.normal.widthOfTextAtSize(texto, 8);
        pagina.drawText(texto, { x: MARGEN + (ancho - anchoTexto) / 2, y: base - 11 - i * 10, size: 8, font: lienzo.normal });
    });

    // Totales abajo a la derecha.
    const xEtiqueta = CARTA.ancho - MARGEN - 210;
    let y = MARGEN + ALTO_PIE - 30;

    for (const fila of r.totales) {
        const fuente = fila.destacada ? lienzo.negrita : lienzo.normal;
        const tamano = fila.destacada ? 11 : 9;

        if (fila.destacada) {
            y -= 6;
            pagina.drawLine({ start: { x: xEtiqueta, y: y + 14 }, end: { x: COLUMNAS.total, y: y + 14 }, thickness: 0.8 });
        }

        const monto = formatearMonto(fila.valor, r.moneda);
        pagina.drawText(imprimible(fila.etiqueta), { x: xEtiqueta, y, size: tamano, font: fuente });
        alDerecha(pagina, fila.resta ? `- ${monto}` : monto, COLUMNAS.total, { y, size: tamano, font: fuente });
        y -= fila.destacada ? 18 : 14;
    }
}

function alDerecha(pagina: PDFPage, texto: string, borde: number, estilo: { y: number; size: number; font: PDFFont }): void {
    pagina.drawText(texto, { ...estilo, x: borde - estilo.font.widthOfTextAtSize(texto, estilo.size) });
}

/**
 * Deja el texto igual a lo que quedo en el XML firmado, y sin caracteres de
 * control que la fuente estandar del PDF no sabe dibujar.
 */
export function imprimible(texto: string): string {
    return sanitizeSiiText(texto).replace(/[ --]/g, ' ');
}

function unirSinRepetir(...partes: (string | undefined)[]): string | undefined {
    const distintas = [...new Set(partes.filter((p): p is string => Boolean(p)))];

    return distintas.length === 0 ? undefined : distintas.join(', ');
}

function envolver(texto: string, fuente: PDFFont, tamano: number, anchoMaximo: number): string[] {
    const renglones: string[] = [];
    let actual = '';

    for (const palabra of texto.split(' ')) {
        const candidato = actual === '' ? palabra : `${actual} ${palabra}`;

        if (fuente.widthOfTextAtSize(candidato, tamano) <= anchoMaximo || actual === '') {
            actual = candidato;
        } else {
            renglones.push(actual);
            actual = palabra;
        }
    }

    return actual === '' ? renglones : [...renglones, actual];
}

function recortar(texto: string, fuente: PDFFont, tamano: number, anchoMaximo: number): string {
    if (fuente.widthOfTextAtSize(texto, tamano) <= anchoMaximo) {
        return texto;
    }

    let recortado = texto;
    while (recortado.length > 0 && fuente.widthOfTextAtSize(`${recortado}…`, tamano) > anchoMaximo) {
        recortado = recortado.slice(0, -1);
    }

    return `${recortado}…`;
}

export function formatearRut(rut: string): string {
    const [cuerpo, digito] = formatRut(rut).split('-');

    return `${Number(cuerpo).toLocaleString('es-CL')}-${digito}`;
}

export function formatearMonto(valor: number, moneda: Representacion['moneda'], decimales = 4): string {
    if (moneda === 'PESO CL') {
        return `$ ${Math.round(valor).toLocaleString('es-CL')}`;
    }

    return `${formatearNumero(valor, decimales)} ${moneda}`;
}

function formatearNumero(valor: number, decimales: number): string {
    return valor.toLocaleString('es-CL', { maximumFractionDigits: decimales });
}

function formatearFecha(fecha: string): string {
    const [anio, mes, dia] = fecha.split('-');

    return `${dia}/${mes}/${anio}`;
}
