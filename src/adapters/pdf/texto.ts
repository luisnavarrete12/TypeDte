import type { PDFFont } from 'pdf-lib';

import type { Representacion } from '../../core/pdf/representacion.ts';
import { formatRut } from '../../core/rut/rut.ts';
import { sanitizeSiiText } from '../../core/xml/text.ts';

/**
 * Texto y formato compartidos por los formatos impresos (carta y ticket).
 */

export function imprimible(texto: string): string {
    return sanitizeSiiText(texto).replace(/[\u0000-\u001F\u007F-\u009F]/g, ' ');
}

export function envolver(texto: string, fuente: PDFFont, tamano: number, anchoMaximo: number): string[] {
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

export function recortar(texto: string, fuente: PDFFont, tamano: number, anchoMaximo: number): string {
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

export function formatearNumero(valor: number, decimales: number): string {
    return valor.toLocaleString('es-CL', { maximumFractionDigits: decimales });
}

export function formatearFecha(fecha: string): string {
    const [anio, mes, dia] = fecha.split('-');

    return `${dia}/${mes}/${anio}`;
}
