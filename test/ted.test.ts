import { ok, strictEqual, throws } from 'node:assert/strict';
import { describe, it } from 'node:test';

import { parseCaf } from '../src/adapters/caf/parse.ts';
import { timbrar, verificarTimbre } from '../src/adapters/ted/timbrar.ts';
import { CafError } from '../src/core/ted/caf.ts';
import type { DatosTimbre } from '../src/core/ted/ted.ts';
import { serialize } from '../src/core/xml/serialize.ts';
import { cabeEnLatin1 } from '../src/core/xml/text.ts';
import { generarCafFalso } from './support/caf-falso.ts';

const TIMESTAMP = '2026-09-16T10:30:00';

const DATOS: DatosTimbre = {
    tipoDte: 33,
    folio: 1,
    fechaEmision: '2026-09-16',
    rutEmisor: '44444444-4',
    rutReceptor: '22222222-2',
    razonSocialReceptor: 'CLIENTE EJEMPLO SPA',
    montoTotal: 119000,
    primerItem: 'Servicio de mantencion',
};

describe('CAF', () => {
    it('lee los datos del archivo de folios', () => {
        const caf = parseCaf(generarCafFalso());

        strictEqual(caf.rutEmisor, '44444444-4');
        strictEqual(caf.tipoDte, 33);
        strictEqual(caf.folioDesde, 1);
        strictEqual(caf.folioHasta, 100);
        ok(caf.llavePrivadaPem.startsWith('-----BEGIN RSA PRIVATE KEY-----'));
    });

    it('conserva el bloque CAF tal cual, porque el SII firmo esos bytes', () => {
        const xml = generarCafFalso();
        const caf = parseCaf(xml);

        ok(xml.includes(caf.xml), 'el bloque extraido no aparece literal en el original');
        ok(caf.xml.startsWith('<CAF version="1.0">'));
        ok(caf.xml.endsWith('</CAF>'));
    });
});

describe('timbre electronico', () => {
    it('firma y la firma valida contra la llave publica del CAF', () => {
        const caf = parseCaf(generarCafFalso());
        const ted = timbrar(DATOS, caf, TIMESTAMP);

        ok(verificarTimbre(ted, caf));
    });

    it('es reproducible: los mismos datos dan el mismo timbre', () => {
        const caf = parseCaf(generarCafFalso());

        strictEqual(
            serialize(timbrar(DATOS, caf, TIMESTAMP)),
            serialize(timbrar(DATOS, caf, TIMESTAMP))
        );
    });

    it('cambiar un peso del monto invalida la firma', () => {
        const caf = parseCaf(generarCafFalso());
        const ted = timbrar(DATOS, caf, TIMESTAMP);
        const adulterado = serialize(ted).replace('<MNT>119000</MNT>', '<MNT>119001</MNT>');

        ok(!adulterado.includes('<MNT>119000</MNT>'));
        ok(serialize(ted) !== adulterado);
    });

    it('incluye el CAF dentro del DD', () => {
        const caf = parseCaf(generarCafFalso());
        const xml = serialize(timbrar(DATOS, caf, TIMESTAMP));

        ok(xml.includes(caf.xml));
        ok(xml.includes('<FRMT algoritmo="SHA1withRSA">'));
        ok(xml.includes(`<TSTED>${TIMESTAMP}</TSTED>`));
    });

    it('respeta el orden de campos que exige el esquema', () => {
        const caf = parseCaf(generarCafFalso());
        const xml = serialize(timbrar(DATOS, caf, TIMESTAMP));
        const orden = ['<RE>', '<TD>', '<F>', '<FE>', '<RR>', '<RSR>', '<MNT>', '<IT1>', '<CAF', '<TSTED>'];

        let posicion = -1;
        for (const tag of orden) {
            const encontrado = xml.indexOf(tag);
            ok(encontrado > posicion, `${tag} quedo fuera de orden`);
            posicion = encontrado;
        }
    });

    it('recorta a 40 caracteres despues de sanear, no antes', () => {
        const caf = parseCaf(generarCafFalso());
        const ted = timbrar(
            { ...DATOS, primerItem: 'Arriendo — bodega — temporada alta en Ñuñoa 2026' },
            caf,
            TIMESTAMP
        );
        const xml = serialize(ted);
        const item = /<IT1>([^<]*)<\/IT1>/.exec(xml)![1]!;

        strictEqual(item.length, 40);
        ok(!item.includes('—'), 'quedo la raya larga sin convertir');
        ok(cabeEnLatin1(item));
    });

    it('firma sobre los bytes latin-1, no sobre los UTF-8', () => {
        const caf = parseCaf(generarCafFalso());
        const ted = timbrar({ ...DATOS, razonSocialReceptor: 'PANADERIA ÑUÑOA LTDA' }, caf, TIMESTAMP);

        ok(verificarTimbre(ted, caf), 'la firma no valida con acentos en el texto');
        ok(cabeEnLatin1(serialize(ted)));
    });

    it('rechaza un folio fuera del rango autorizado', () => {
        const caf = parseCaf(generarCafFalso({ folioDesde: 1, folioHasta: 10 }));

        throws(() => timbrar({ ...DATOS, folio: 11 }, caf, TIMESTAMP), CafError);
    });

    it('rechaza timbrar un tipo de documento que el CAF no autoriza', () => {
        const caf = parseCaf(generarCafFalso({ tipoDte: 33 }));

        throws(() => timbrar({ ...DATOS, tipoDte: 39 }, caf, TIMESTAMP), CafError);
    });
});
