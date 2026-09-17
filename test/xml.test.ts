import { deepStrictEqual, ok, strictEqual } from 'node:assert/strict';
import { describe, it } from 'node:test';

import { el, fields } from '../src/core/xml/node.ts';
import { serialize, toLatin1, XML_DECLARATION } from '../src/core/xml/serialize.ts';
import { cabeEnLatin1, sanitizeSiiText } from '../src/core/xml/text.ts';

describe('serializacion determinista', () => {
    it('respeta el orden en que se declararon los hijos', () => {
        const documento = fields('Encabezado', [
            ['TipoDTE', 33],
            ['Folio', 1],
            ['FchEmis', '2026-09-16'],
        ]);

        strictEqual(
            serialize(documento),
            '<Encabezado><TipoDTE>33</TipoDTE><Folio>1</Folio><FchEmis>2026-09-16</FchEmis></Encabezado>'
        );
    });

    it('omite los campos vacios en vez de emitir tags huecos', () => {
        const documento = fields('Receptor', [
            ['RUTRecep', '76543210-3'],
            ['GiroRecep', undefined],
            ['DirRecep', ''],
            ['CmnaRecep', 'Temuco'],
        ]);

        strictEqual(
            serialize(documento),
            '<Receptor><RUTRecep>76543210-3</RUTRecep><CmnaRecep>Temuco</CmnaRecep></Receptor>'
        );
    });

    it('escribe los elementos vacios como par de tags, igual que la canonicalizacion', () => {
        strictEqual(serialize(el('TED')), '<TED></TED>');
    });

    it('produce los mismos bytes al serializar dos veces', () => {
        const documento = el('DTE', { version: '1.0' }, [
            fields('Emisor', [['RUTEmisor', '78416626-0']]),
        ]);

        strictEqual(serialize(documento), serialize(documento));
    });

    it('no mete espacios entre elementos salvo que se pidan', () => {
        const documento = el('A', undefined, [el('B', undefined, ['x'])]);

        ok(!serialize(documento).includes('\n'));
        ok(serialize(documento, { indent: '  ' }).includes('\n'));
    });

    it('antepone el prologo con el encoding del SII', () => {
        ok(serialize(el('DTE'), { declaration: true }).startsWith(XML_DECLARATION));
    });
});

describe('escapado', () => {
    it('escapa los caracteres que romperian el XML', () => {
        const documento = fields('Item', [['NmbItem', 'Repuestos & servicio <urgente>']]);

        strictEqual(
            serialize(documento),
            '<Item><NmbItem>Repuestos &amp; servicio &lt;urgente&gt;</NmbItem></Item>'
        );
    });

    it('escapa las comillas dentro de atributos', () => {
        strictEqual(serialize(el('DTE', { ID: 'a"b' })), '<DTE ID="a&quot;b"></DTE>');
    });
});

describe('rango ISO-8859-1', () => {
    it('conserva acentos y enie, que si son parte de latin-1', () => {
        const texto = sanitizeSiiText('Nuñez, Concepción, Ñuñoa');

        strictEqual(texto, 'Nuñez, Concepción, Ñuñoa');
        ok(cabeEnLatin1(texto));
    });

    it('convierte la raya larga que insertan los editores', () => {
        strictEqual(sanitizeSiiText('Servicio — mantencion'), 'Servicio - mantencion');
    });

    it('convierte comillas tipograficas y puntos suspensivos', () => {
        strictEqual(sanitizeSiiText('“Hola” … ‘chao’'), '"Hola" ... \'chao\'');
    });

    it('deja todo dentro del rango, incluso texto que no es latino', () => {
        const texto = sanitizeSiiText('Producto 日本 emoji 🙂');

        ok(cabeEnLatin1(texto), `quedo fuera de rango: ${texto}`);
    });

    it('sanea tambien lo que se serializa, no solo lo que se inspecciona', () => {
        const documento = fields('Item', [['NmbItem', 'Arriendo — mayo']]);

        ok(cabeEnLatin1(serialize(documento)));
    });

    it('el viaje de ida y vuelta a latin-1 no pierde nada', () => {
        const xml = serialize(fields('Emisor', [['RznSoc', 'Panadería Ñuñoa Ltda.']]));
        const bytes = toLatin1(xml);

        deepStrictEqual(bytes.toString('latin1'), xml);
    });
});
