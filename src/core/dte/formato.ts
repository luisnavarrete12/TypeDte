/**
 * Los decimales del esquema admiten hasta 6 posiciones. Redondear aca evita
 * emitir ruido de punto flotante como 0.30000000000000004, que el esquema
 * rechaza.
 */
export function decimal(valor: number | undefined, posiciones = 6): string | undefined {
    return valor === undefined ? undefined : String(Number(valor.toFixed(posiciones)));
}
