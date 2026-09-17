import { ok, strictEqual } from 'node:assert/strict';
import { describe, it } from 'node:test';

import { verificarFirma, firmarDocumento } from '../src/adapters/firma/firmar.ts';
import { cumpleEsquema, validarContraEsquema } from '../src/adapters/schema/validar.ts';
import { enviarDocumentos } from '../src/adapters/sii/envio.ts';
import { verificarTimbre } from '../src/adapters/ted/timbrar.ts';
import { idDocumento } from '../src/core/dte/documento.ts';
import { construirEnvioDte, ID_SET_DTE, RUT_SII } from '../src/core/dte/envio.ts';
import { TIPO, type FacturaAfecta } from '../src/core/dte/tipos.ts';
import { serialize, XML_DECLARATION } from '../src/core/xml/serialize.ts';
import { cabeEnLatin1 } from '../src/core/xml/text.ts';
import { EMISION, EMISOR, emitir, RECEPTOR } from './support/emitir.ts';
import { SUBIDA_OK, transporteGrabado } from './support/sii-grabado.ts';

const FACTURA: FacturaAfecta = {
    tipo: TIPO.FACTURA_AFECTA,
    folio: 1,
    fechaEmision: EMISION,
    emisor: EMISOR,
    receptor: RECEPTOR,
    items: [{ nombre: 'Marraqueta', cantidad: 100, precioUnitario: 1000 }],
};

function ensobrar(emitido: ReturnType<typeof emitir>) {
    const envio = construirEnvioDte(
        {
            rutEmisor: EMISOR.rut,
            rutEnvia: '11111111-1',
            rutReceptor: RUT_SII,
            fechaResolucion: '2026-01-01',
            numeroResolucion: 0,
            timestampFirma: '2026-09-16T10:30:10',
        },
        [emitido.firmado]
    );

    return XML_DECLARATION + serialize(firmarDocumento(envio, ID_SET_DTE, emitido.certificado));
}

describe('factura completa, sin tocar la red', () => {
    it('el esquema oficial del SII la acepta', () => {
        validarContraEsquema(emitir(FACTURA).xml, 'DTE_v10.xsd');
    });

    it('calcula neto, IVA y total desde las lineas', () => {
        const { xml } = emitir(FACTURA);

        ok(xml.includes('<MntNeto>100000</MntNeto>'));
        ok(xml.includes('<IVA>19000</IVA>'));
        ok(xml.includes('<MntTotal>119000</MntTotal>'));
    });

    it('el timbre valida contra la llave del CAF', () => {
        const { ted, caf } = emitir(FACTURA);

        ok(verificarTimbre(ted, caf));
    });

    it('la firma valida contra el certificado', () => {
        const { firmado, certificado } = emitir(FACTURA);

        ok(verificarFirma(firmado, idDocumento(TIPO.FACTURA_AFECTA, 1), certificado));
    });

    it('todo el documento cabe en ISO-8859-1, acentos incluidos', () => {
        const { xml } = emitir(FACTURA);

        ok(cabeEnLatin1(xml));
        ok(xml.includes('Ñuñoa'));
        ok(xml.includes('Irarrázaval'));
    });

    it('el sobre que recibe el SII tambien pasa su esquema', () => {
        validarContraEsquema(ensobrar(emitir(FACTURA)), 'EnvioDTE_v10.xsd');
    });

    it('la caratula cuenta los documentos que van adentro', () => {
        const sobre = ensobrar(emitir(FACTURA));

        ok(sobre.includes('<TpoDTE>33</TpoDTE><NroDTE>1</NroDTE>'));
        ok(sobre.includes(`<RutReceptor>${RUT_SII}</RutReceptor>`));
    });

    it('el envio llega al SII y vuelve con un acuse', async () => {
        const transporte = transporteGrabado({ DTEUpload: SUBIDA_OK });
        const acuse = await enviarDocumentos(ensobrar(emitir(FACTURA)), {
            ambiente: 'certificacion',
            token: { valor: 'T', obtenidoEn: new Date() },
            rutEnvia: '11111111-1',
            rutEmisor: EMISOR.rut,
            transporte,
        });

        // Un trackId es acuse de recibo, no aceptacion: el SII valida despues.
        ok(acuse.trackId.length > 0);
        strictEqual(transporte.llamadas.length, 1);
    });

    it('un monto adulterado despues de firmar sigue pasando el esquema', () => {
        const { xml } = emitir(FACTURA);
        const adulterado = xml.replace('<MntTotal>119000</MntTotal>', '<MntTotal>11900</MntTotal>');

        ok(adulterado !== xml);
        // La estructura no detecta fraude: es la firma la que lo hace, y por
        // eso validar contra el esquema no reemplaza verificar la firma.
        ok(cumpleEsquema(adulterado, 'DTE_v10.xsd'));
    });
});
