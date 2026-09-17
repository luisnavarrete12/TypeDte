/**
 * Modelo de los documentos tributarios.
 *
 * Cada tipo es una variante de la union discriminada por `tipo`. Lo que el SII
 * exige para un tipo en particular vive en su variante: una nota de credito
 * sin referencia al documento que corrige no compila, y una guia de despacho
 * sin motivo de traslado tampoco. El error aparece en el editor, no en un
 * rechazo que gasta un folio.
 */

export const TIPO = {
    FACTURA_AFECTA: 33,
    FACTURA_EXENTA: 34,
    FACTURA_COMPRA: 46,
    GUIA_DESPACHO: 52,
    NOTA_DEBITO: 56,
    NOTA_CREDITO: 61,
} as const;

/** Liquidacion-factura: la emite quien vende por cuenta de otro. */
export const TIPO_LIQUIDACION_FACTURA = 43;

export const TIPO_EXPORTACION = {
    FACTURA: 110,
    NOTA_DEBITO: 111,
    NOTA_CREDITO: 112,
} as const;

export const TIPO_BOLETA = {
    AFECTA: 39,
    EXENTA: 41,
} as const;

export type TipoDocumento = (typeof TIPO)[keyof typeof TIPO];
export type TipoBoleta = (typeof TIPO_BOLETA)[keyof typeof TIPO_BOLETA];
export type TipoExportacion = (typeof TIPO_EXPORTACION)[keyof typeof TIPO_EXPORTACION];

export interface Emisor {
    readonly rut: string;
    readonly razonSocial: string;
    readonly giro: string;
    /** Codigos de actividad economica del SII. El esquema admite de 1 a 4. */
    readonly actividadesEconomicas: readonly [number, ...number[]];
    readonly direccion: string;
    readonly comuna: string;
    readonly ciudad?: string;
    readonly telefono?: string;
    readonly correo?: string;
    readonly codigoSucursal?: number;
}

export interface Receptor {
    readonly rut: string;
    readonly razonSocial: string;
    readonly giro: string;
    readonly direccion: string;
    readonly comuna: string;
    readonly ciudad?: string;
    readonly contacto?: string;
    readonly correo?: string;
}

export interface Item {
    readonly nombre: string;
    readonly descripcion?: string;
    readonly cantidad?: number;
    readonly unidad?: string;
    readonly precioUnitario?: number;
    readonly descuentoPorcentaje?: number;
    readonly descuentoMonto?: number;
    /**
     * Monto final de la linea. Si se omite se calcula como cantidad por precio
     * menos descuento. Pasarlo explicito sirve cuando el precio viene con mas
     * decimales de los que el redondeo reproduce.
     */
    readonly monto?: number;
    /** La linea no esta afecta a IVA. En facturas exentas, todas lo estan. */
    readonly exento?: boolean;
}

export type TipoMovimientoGlobal = 'descuento' | 'recargo';

export interface MovimientoGlobal {
    readonly tipo: TipoMovimientoGlobal;
    readonly glosa?: string;
    /** `porcentaje` sobre el neto afecto, o `monto` en pesos. */
    readonly porcentaje?: number;
    readonly monto?: number;
}

/**
 * Para que sirve la referencia en una nota.
 *
 * - `anula`: deja sin efecto el documento completo.
 * - `corrige_texto`: arregla giro, razon social u otro dato; va con montos en cero.
 * - `corrige_montos`: ajusta cantidades o precios.
 */
export type CodigoReferencia = 'anula' | 'corrige_texto' | 'corrige_montos';

export interface Referencia {
    /** Tipo del documento referenciado. Puede ser un DTE o un codigo del SII como `801` (orden de compra). */
    readonly tipoDocumento: number | string;
    readonly folio: string | number;
    readonly fecha: string;
    readonly codigo?: CodigoReferencia;
    readonly razon?: string;
}

export type FormaPago = 'contado' | 'credito' | 'sin_costo';

/**
 * Motivo del traslado en una guia de despacho.
 * 1 venta, 2 venta por efectuar, 3 consignacion, 4 entrega gratuita,
 * 5 traslado interno, 6 otros traslados no venta, 7 guia de devolucion,
 * 8 traslado para exportacion, 9 venta para exportacion.
 */
export type IndicadorTraslado = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9;

/** 1 despacho por cuenta del receptor, 2 del emisor a instalaciones del cliente, 3 del emisor a otras instalaciones. */
export type TipoDespacho = 1 | 2 | 3;

interface Comun {
    readonly folio: number;
    readonly fechaEmision: string;
    readonly emisor: Emisor;
    readonly receptor: Receptor;
    /** El esquema admite hasta 60 lineas. */
    readonly items: readonly [Item, ...Item[]];
    readonly movimientosGlobales?: readonly MovimientoGlobal[];
    readonly formaPago?: FormaPago;
    readonly fechaVencimiento?: string;
    /** Referencias informativas, como una orden de compra. */
    readonly referencias?: readonly Referencia[];
}

export interface FacturaAfecta extends Comun {
    readonly tipo: typeof TIPO.FACTURA_AFECTA;
}

export interface FacturaExenta extends Comun {
    readonly tipo: typeof TIPO.FACTURA_EXENTA;
}

/**
 * La emite el comprador cuando el vendedor no puede facturar. El comprador
 * retiene el IVA y lo paga el directamente, asi que el total no lo incluye.
 */
export interface FacturaCompra extends Comun {
    readonly tipo: typeof TIPO.FACTURA_COMPRA;
}

export interface GuiaDespacho extends Comun {
    readonly tipo: typeof TIPO.GUIA_DESPACHO;
    readonly indicadorTraslado: IndicadorTraslado;
    readonly tipoDespacho?: TipoDespacho;
    readonly transporte?: {
        readonly patente?: string;
        readonly rutTransportista?: string;
        readonly direccionDestino?: string;
        readonly comunaDestino?: string;
        readonly ciudadDestino?: string;
    };
}

/** Una nota siempre corrige algo: sin al menos una referencia no existe. */
interface Nota extends Omit<Comun, 'referencias'> {
    readonly referencias: readonly [Referencia, ...Referencia[]];
}

export interface NotaDebito extends Nota {
    readonly tipo: typeof TIPO.NOTA_DEBITO;
}

export interface NotaCredito extends Nota {
    readonly tipo: typeof TIPO.NOTA_CREDITO;
}

export type DocumentoTributario =
    | FacturaAfecta
    | FacturaExenta
    | FacturaCompra
    | GuiaDespacho
    | NotaDebito
    | NotaCredito;

/** Que se esta vendiendo, segun el SII. Lo normal en un comercio es `venta_y_servicios`. */
export type IndicadorServicio =
    | 'servicios_periodicos_domiciliarios'
    | 'otros_servicios_periodicos'
    | 'venta_y_servicios'
    | 'espectaculos';

/** En una boleta el receptor es opcional: casi siempre es un consumidor anonimo. */
export interface ReceptorBoleta {
    readonly rut?: string;
    readonly razonSocial?: string;
    readonly contacto?: string;
    readonly direccion?: string;
    readonly comuna?: string;
    readonly ciudad?: string;
}

/**
 * Las referencias de boleta no apuntan a otro documento con fecha y folio:
 * son codigos internos, como el caso de un set de certificacion o la caja.
 */
export interface ReferenciaBoleta {
    readonly codigo?: string;
    readonly razon?: string;
    readonly codigoVendedor?: string;
    readonly codigoCaja?: string;
}

interface ComunBoleta {
    readonly folio: number;
    readonly fechaEmision: string;
    readonly emisor: Emisor;
    readonly receptor?: ReceptorBoleta;
    /**
     * Los montos de una boleta van con IVA incluido: es el precio que ve el
     * cliente. El neto y el IVA se desglosan al calcular los totales.
     */
    readonly items: readonly [Item, ...Item[]];
    readonly indicadorServicio?: IndicadorServicio;
    readonly movimientosGlobales?: readonly MovimientoGlobal[];
    readonly referencias?: readonly ReferenciaBoleta[];
}

export interface BoletaAfecta extends ComunBoleta {
    readonly tipo: typeof TIPO_BOLETA.AFECTA;
}

export interface BoletaExenta extends ComunBoleta {
    readonly tipo: typeof TIPO_BOLETA.EXENTA;
}

/**
 * Las boletas son una union aparte de `DocumentoTributario` a proposito: viajan
 * en otro sobre (`EnvioBOLETA`) y con otro esquema. Mezclarlas en un mismo
 * envio con facturas es un rechazo seguro, y separadas no se puede.
 */
export type Boleta = BoletaAfecta | BoletaExenta;

/** Catalogo cerrado de monedas del esquema del SII (`TipMonType`), tal cual se escriben. */
export const MONEDAS = [
    'BOLIVAR', 'BOLIVIANO', 'CHELIN', 'CORONA DIN', 'CORONA NOR', 'CORONA SC',
    'CRUZEIRO REAL', 'DIRHAM', 'DOLAR AUST', 'DOLAR CAN', 'DOLAR HK', 'DOLAR NZ',
    'DOLAR SIN', 'DOLAR TAI', 'DOLAR USA', 'DRACMA', 'ESCUDO', 'EURO', 'FLORIN',
    'FRANCO BEL', 'FRANCO FR', 'FRANCO SZ', 'GUARANI', 'LIBRA EST', 'LIRA',
    'MARCO AL', 'MARCO FIN', 'NUEVO SOL', 'OTRAS MONEDAS', 'PESETA', 'PESO',
    'PESO CL', 'PESO COL', 'PESO MEX', 'PESO URUG', 'RAND', 'RENMINBI', 'RUPIA',
    'SUCRE', 'YEN',
] as const;

export type Moneda = (typeof MONEDAS)[number];

/**
 * Receptor de una exportacion: una empresa extranjera sin RUT chileno. Se
 * identifica con el documento de su pais y su nacionalidad.
 */
export interface ReceptorExtranjero {
    /** Si se omite se usa el RUT generico para extranjeros. */
    readonly rut?: string;
    readonly razonSocial: string;
    readonly giro?: string;
    readonly direccion?: string;
    readonly ciudad?: string;
    readonly correo?: string;
    /** Identificador tributario en su pais. */
    readonly numeroIdentificacion?: string;
    /** Codigo de pais segun la tabla de Aduanas. */
    readonly nacionalidad?: number;
}

export interface Bulto {
    /** Codigo de tipo de bulto segun la tabla de Aduanas. */
    readonly tipo: number;
    readonly cantidad: number;
    readonly marcas?: string;
    readonly idContenedor?: string;
    readonly sello?: string;
}

/**
 * Datos de la operacion aduanera. Todos los codigos son de las tablas del
 * Servicio Nacional de Aduanas; el esquema solo valida que sean numeros, no
 * que existan en la tabla, asi que vale la pena revisarlos contra ella.
 */
export interface Aduana {
    readonly modalidadVenta?: number;
    readonly clausulaVenta?: number;
    readonly totalClausulaVenta?: number;
    readonly viaTransporte?: number;
    readonly nombreTransporte?: string;
    readonly puertoEmbarque?: number;
    readonly puertoDesembarque?: number;
    readonly pesoBruto?: number;
    readonly unidadPesoBruto?: number;
    readonly pesoNeto?: number;
    readonly unidadPesoNeto?: number;
    readonly totalBultos?: number;
    readonly bultos?: readonly Bulto[];
    readonly flete?: number;
    readonly seguro?: number;
    readonly paisReceptor?: number;
    readonly paisDestino?: number;
}

interface ComunExportacion {
    readonly folio: number;
    readonly fechaEmision: string;
    readonly emisor: Emisor;
    readonly receptor: ReceptorExtranjero;
    /** Los montos de las lineas van en esta moneda, con hasta 4 decimales. */
    readonly moneda: Moneda;
    readonly items: readonly [Item, ...Item[]];
    readonly aduana?: Aduana;
    readonly movimientosGlobales?: readonly MovimientoGlobal[];
    readonly formaPago?: Exclude<FormaPago, 'sin_costo'>;
    /** La exportacion es de servicios y no de mercaderia. */
    readonly esServicio?: boolean;
}

export interface FacturaExportacion extends ComunExportacion {
    readonly tipo: typeof TIPO_EXPORTACION.FACTURA;
    readonly referencias?: readonly Referencia[];
}

export interface NotaDebitoExportacion extends ComunExportacion {
    readonly tipo: typeof TIPO_EXPORTACION.NOTA_DEBITO;
    readonly referencias: readonly [Referencia, ...Referencia[]];
}

export interface NotaCreditoExportacion extends ComunExportacion {
    readonly tipo: typeof TIPO_EXPORTACION.NOTA_CREDITO;
    readonly referencias: readonly [Referencia, ...Referencia[]];
}

/**
 * Los documentos de exportacion van en el mismo sobre que las facturas pero
 * bajo otro nodo del esquema (`Exportaciones` en vez de `Documento`), y con
 * reglas propias: todo exento y en moneda extranjera.
 */
export type DocumentoExportacion = FacturaExportacion | NotaDebitoExportacion | NotaCreditoExportacion;

/**
 * Un cargo que el consignatario le descuenta al mandante por haber vendido a
 * su nombre: su comision, o algun otro cargo como flete o bodegaje.
 */
export interface Comision {
    readonly tipo: 'comision' | 'otro_cargo';
    readonly glosa: string;
    /** Porcentaje informativo sobre las ventas. No se usa para calcular. */
    readonly tasa?: number;
    /** Monto afecto a IVA. El IVA de la comision se calcula. */
    readonly neto: number;
    readonly exento?: number;
}

/**
 * La emite un consignatario al dueno de la mercaderia (el mandante), para
 * rendirle las ventas que hizo a su nombre y cobrarle su comision.
 *
 * El detalle son las ventas; las comisiones van aparte y se restan del total.
 * Por eso sin al menos una comision no tiene sentido emitirla.
 *
 * El esquema no admite descuentos ni recargos globales en este documento.
 */
/**
 * Una venta rendida al mandante. Dice con que documento se hizo esa venta, y
 * no admite descuentos por linea: el esquema no los contempla aca.
 */
export interface ItemLiquidacion extends Omit<Item, 'descuentoPorcentaje' | 'descuentoMonto'> {
    /** Tipo del documento con que se vendio: 33 factura electronica, 39 boleta, etc. */
    readonly tipoDocumentoLiquidado: number;
}

export interface LiquidacionFactura extends Omit<Comun, 'movimientosGlobales' | 'items'> {
    readonly tipo: typeof TIPO_LIQUIDACION_FACTURA;
    readonly items: readonly [ItemLiquidacion, ...ItemLiquidacion[]];
    readonly comisiones: readonly [Comision, ...Comision[]];
}
