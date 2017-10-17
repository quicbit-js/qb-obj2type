// Software License Agreement (ISC License)
//
// Copyright (c) 2017, Matthew Voss
//
// Permission to use, copy, modify, and/or distribute this software for
// any purpose with or without fee is hereby granted, provided that the
// above copyright notice and this permission notice appear in all copies.
//
// THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES
// WITH REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF
// MERCHANTABILITY AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR
// ANY SPECIAL, DIRECT, INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES
// WHATSOEVER RESULTING FROM LOSS OF USE, DATA OR PROFITS, WHETHER IN AN
// ACTION OF CONTRACT, NEGLIGENCE OR OTHER TORTIOUS ACTION, ARISING OUT OF
// OR IN CONNECTION WITH THE USE OR PERFORMANCE OF THIS SOFTWARE.

var test = require('test-kit').tape()
var qbobj = require('qb1-obj')
var tbase = require('qb1-type-base')
var CODES = tbase.CODES
var typobj = require('.')

test('has_char', function (t) {
    t.table_assert([
        [ 's',          'c',      'e',       'exp' ],
        [ 'abc',        'd',      '^',       false ],
        [ 'abc',        'a',      '^',       true ],
        [ 'abc',        'b',      '^',       true ],
        [ 'abc',        'c',      '^',       true ],
        [ 'ab^c',       'c',      '^',       false ],
        [ 'ab^^c',      'c',      '^',       true ],
        [ 'ab^^^c',     'c',      '^',       false ],
    ], typobj._has_char)
})

function err (msg) { throw Error(msg) }

test('obj2typ - basic', function (t) {
    t.table_assert(
        [
            [ 'obj',                                            'exp' ],
            [ 's',                                              'str' ],
            [ 'str',                                            'str' ],
            [ 'string',                                         'str' ],
            [ { $type:'typ', $value: 's' },                     'str' ],
            [ { $type:'typ', $value: 'str' },                   'str' ],
            [ { $type:'typ', $value: 'string' },                'str' ],
            [ { $base: 's' },                                   { $base: 'str' } ],
            [ { $base: 'str' },                                 { $base: 'str' } ],
            [ { $base: 'string' },                              { $base: 'str' } ],
            // [ 'i',                              'int' ],
            // [ {},                               { base: 'obj' } ],
            // [ { $t: 't' },                      { base: 'obj' } ],
            // [ { $typ: 't' },                    { base: 'obj' } ],
            // [ { $type: 'typ' },                 { base: 'obj' } ],
            // [ { $base: 'obj' },                 { base: 'obj' } ],
            // [ { $base: 'int' },                 { base: 'int' } ],
            // [ { $base: 'str' },                 { base: 'str' } ],
            [ { id: 'number' },                                 { id: 'num' } ],
            [ { $base: 'obj', id: 'n' },                        { id: 'num' } ],
            [ { base: 'obj', id: 'n' },                         { base: 'obj', id: 'num' } ],
            [ [],                                               [] ],
            [ [ 'i' ],                                          [ 'int' ] ],
            [ [ { a: 's'} ],                                    [ { a: 'str' } ] ],
            [ [ { a: [ 'i', 'n' ]} ],                           [ { a: [ 'int', 'num' ] } ] ],
            [ { a: 'int', b: {x: 'string', y: ['int'] } },      { a: 'int', b: { x: 'str', y: ['int'] } } ],
        ],
        function (obj) {
            var info = typobj.obj2typ(obj)
            Object.keys(info.byname).length === 0 || err('byname should be empty')
            Object.keys(info.unresolved).length === 0 || err('unresolved should be empty')
            return info.root.obj({name_depth:0})
        }
    )
})

test('obj2typ - errors', function (t) {
    t.table_assert([
        [ 'obj',                                        'exp' ],
        [ { a: 'n', $v: { b: 's' } },                   /missing \$type property/ ],
        [ { $base: 'obj', $multi: ['str','int'] },      /mismatched base.  expected mul/ ],
    ], typobj.obj2typ, {assert: 'throws'})
})

test('obj_by_name - named', function (t) {
    t.table_assert(
        [
            [
                'obj',
                'exp',
            ],
            [
                // base inherited, not name/description
                { $n: 'xtype', $d: 'an example type', $base: 'i', $stip: {a:4} },
                { root: { $base: 'int', $name: 'xtype', $desc: 'an example type', $stip: { a: 4 } }, names: [ 'xtype' ], unresolved: [] }
            ],
            [
                {
                    $name: 't1', $description: 'a test type',
                    a: 'int',
                    b: {
                        x: 'str',
                        y: ['int']
                    },
                    c: 'foo'
                },
                {
                    root: { $name: 't1', $desc: 'a test type', a: 'int', b: { x: 'str', y: [ 'int' ] }, c: 'foo' },
                    names: [ 't1' ],
                    unresolved: [ 'foo' ]
                }
            ],
            [
                // keep stipulations intact (non-type args)
                {
                    $name: 't1',
                    a: 'int',
                    b: {
                        x: 'str',
                        y: ['int']
                    },
                    $stip: { $n: 'x', string: 'int' }
                },
                { root: { $name: 't1', $stip: { $n: 'x', string: 'int' }, a: 'int', b: { x: 'str', y: [ 'int' ] } }, names: [ 't1' ], unresolved: [] }
            ],
            [
                {
                    $name: 't1',
                    a: 'int',
                    b: {
                        $name: 't2',
                        x: 'str',
                        y: ['int'],
                        c: 'xt'
                    }
                },
                { root: { $name: 't1', a: 'int', b: 't2' }, names: [ 't2', 't1' ], unresolved: [ 'xt' ] }
            ]
        ],
        function (obj) {
            var info = typobj.obj2typ(obj)
            return {
                root: info.root.obj(),
                names: Object.keys(info.byname),
                unresolved: Object.keys(info.unresolved)
            }
        }
    )
})

test('obj2typ', function (t) {
    var typstr_trans = function (n) { return base_types_by_name[n].name }
    t.table_assert(
        [
            [ 'o',                              'transform',                    'exp' ],
            [
                { $type:'t', $value: 's', $stip: 'foo' },
                { t: 'typ', s: 'str' },
                { base: 'str' },
            ],
            // [
            //     { '*':
            //         {
            //             name: 's',
            //             description: 's',
            //             maintainers: [],
            //             keywords: ['s'],
            //             author: { name: 's', email: 's' }
            //         }
            //     },
            //     base_types_by_name,
            //     {
            //         base: 'obj',
            //         fields: {},
            //         pfields: { '*': {
            //             base: 'obj',
            //             fields: {
            //                 name: {
            //                     name: 'str',
            //                     desc: 'A string of unicode characters (code points in range 0..1114111)',
            //                     tinyname: 's',
            //                     fullname: 'string',
            //                     stip: null
            //                 },
            //                 description: {
            //                     name: 'str',
            //                     desc: 'A string of unicode characters (code points in range 0..1114111)',
            //                     tinyname: 's',
            //                     fullname: 'string', stip: null
            //                 },
            //                 maintainers: { base: 'arr', array: [Object] },
            //                 keywords: { base: 'arr', array: [Object] },
            //                 author: { base: 'obj', fields: [Object] }
            //             }
            //         } }
            //     }
            // ],
            //
            [ 's',                             {s:'str'},                       'str' ],
            [ 'N',                             {N:'nul'},                       'nul' ],
            [
                { $value: ['i'] },
                { a: 'arr', i: 'int' },
                { base: 'arr', array: ['int'] }
            ],
            [
                { $base: 'a', $array: ['i'] },
                { a: 'arr', i: 'int' },
                { base: 'arr', array: ['int'] }
            ],
            // test that special words 'base' and 'array' are just custom properties when '$' is absent
            [
                { $value: {base: 'a', array: ['i']} },
                { a: 'arr', i: 'int' },
                { base: 'obj', fields: { base: 'arr', array: { base: 'arr', array: [ 'int' ] } }, pfields: {} }
            ],
            [ {a:'s', b:'i'},                   {s:'str',i:'int'},              { base: 'obj', fields: { a: 'str', b: 'int' }, pfields: {} } ],
            [ {$t:'t', a:'s', b:'i'},           {t:'typ',s:'str',i:'int'},      { base: 'obj', fields: { a: 'str', b: 'int' }, pfields: {} } ],                // $type is optional
            [ {},                               {},                             { base: 'obj', fields: {}, pfields: { '*': '*' } } ],
            [ {$n:'foo', a:'s', b:'i'},         {s:'str',i:'int'},              { base: 'obj', name: 'foo', tinyname: 'foo', fullname: 'foo', fields: { a: 'str', b: 'int' }, pfields: {} } ],
            [ {a:'s', 'b*':'i'},                {s:'str',i:'int'},              { base: 'obj', fields: { a: 'str' }, pfields: { 'b*': 'int' } } ],
            [
                { $n:'foo', $tn:'fo', $fn:'fooo', a:'s', 'b*':'i' },
                { s:'s', i:'i' },
                { base: 'obj', name: 'foo', tinyname: 'fo', fullname: 'fooo', pfields: { 'b*': 'i' }, fields: { a: 's' } }
            ],
            [
                { $n:'foo', a:'s', 'b*':{ $n:'int', $base: 'int'} },
                { s:'s', i:'i' },
                { base: 'obj', name: 'foo', tinyname: 'foo', fullname: 'foo', pfields: { 'b*': 'int' }, fields: { a: 's' } }
            ],
            [ ['o','s'],                        {o:'o',s:'s'},    { base: 'arr', array: [ 'o', 's' ] } ],
        ],
        function (o, transform) {
            var typstr_trans = function (v) { return transform[v] }
            var info = typobj.obj2typ(o, typstr_trans)
            var obj = typeof info.root === 'string' && info.byname[info.root] || info.root
            if (typeof obj === 'object') {
                obj = qbobj.map(obj, null, null, {deep: ['base']})   // removes null values, descriptions, fullnames...
            }
            return obj
        }
    )
})

test('obj2typ errors', function (t) {
    t.table_assert(
        [
            [ 'o',                                      'transform',                    'exp' ],
            [ {o: { $tn:'f', a:'s'} },                  {s:'str'},                      /missing name prop/ ],
            [ {o: { $foo:'f', a:'s'} },                 {s:'str'},                      /unknown property/ ],
            [ {a:'x', b:'i'},                           {i:'int'},                      /unknown type/ ],
            [ {a: { $n:7, a:'s'} },                     {},                             /illegal type/ ],
            [ [ { $n:'x', a:'s'}, { $n:'x', b:'i' } ],  {},                             /name used more than once/ ],
        ],
        function (o, transform) {
            typobj.obj2typ(o, function (v) {
                return transform[v]
            })
        },
        { assert: 'throws' }
    )
})

test('typ2obj', function (t) {
    t.table_assert(
        [
            [ 'tprops',                                     'transform',                'opt',          'exp' ],
            [ 'str',                                        {},                         null,           'str' ],
            [ {base:'obj'},                                 {},                         null,           {} ],
            [ {base:'obj', fields:{}},                      {},                         null,           {} ],
            [ {base:'obj', fields:{}, pfields:{}},          {},                         null,           {} ],
            [ {base:'obj', fields:{}, pfields:{'*':'*'}},   {},                         null,           {} ],
            [ {base:'obj', name:'foo'},                     {},                         null,           { $name: 'foo'} ],

            [ {base:'obj', name:'foo', fields:{a:'i'}},     {i:'i'},                    null,           { $name: 'foo', a: 'i'} ],
            [
                {base:'obj', name:'foo', tinyname: 'fo', fullname: 'fooo', fields:{a:'i'}},
                {i:'i'},
                null,
                { $name: 'foo', $tinyname: 'fo', $fullname: 'fooo', a: 'i' }
            ],
            [
                {base:'obj', name:'foo', tinyname: 'fo', fullname: 'fooo', fields:{a:'i'}},
                { i:'i' },
                { tnf: 'tinyname', excl:{tinyname:1} },
                { $n: 'foo', $fn: 'fooo', a: 'i' }
            ],
            [
                {base:'obj', name:'foo', tinyname: 'fo', fullname: 'fooo', fields:{a:'i'}},
                { i:'i' },
                { tnf: 'fullname', incl:{name:1} },
                { $name: 'foo', a: 'i' }
            ],
            [
                {base:'obj', name:'foo', tinyname: 'fo', fullname: 'fooo', fields:{a:'i'}},
                { i:'i' },
                { incl:{name:1}, excl:{name:1} },       // exclude overrides include
                { a: 'i' }
            ],
            [ {base:'obj', name:'foo', pfields:{'a*':'i'}},    {i:'i'},                    null,            { $name: 'foo', 'a*': 'i' } ],
            [ {base:'arr', array:['i','s']},                {arr: 'a', i:'i',s:'s'},    null,            [ 'i', 's' ] ],
            [ {base:'arr', name:'foo', array:['i','s']},    {arr: 'a', i:'i',s:'s'},    null,            { $base: 'a', $name: 'foo', $array: ['i','s']} ],
            [ {base:'arr', name:'foo', array:['i','s']},    {arr: 'a', i:'i',s:'s'},    {incl:{name:1}}, { $name: 'foo', $array: ['i','s']} ],
            [ {base:'arr', name:'foo', array:['i','s']},    {arr: 'a', i:'i',s:'s'},    {excl:{name:1}}, [ 'i', 's' ] ],
            [ {base:'arr', name:'arr'},                     {'*':'*'},                  null,            [] ],
            [ {base:'obj', name:'obj'},                     {},                         null,            {} ],
        ],
        function (tprops, transform, opt) {
            var type = tbase.create(tprops)
            var ret = typobj.typ2obj(type, function (name) {
                return transform[name]
            }, opt)
            if (typeof ret === 'object' && !Array.isArray(ret)) {
                ret = qbobj.map(ret)   // removes null values
            }
            return ret
        }
    )
})

test('typ2obj errors', function (t) {
    t.table_assert(
        [
            [ 'tprops',                                                'transform',           'opt',          'exp' ],
            [ {code: -1, base:'obj', fields:{a:'i'}},     {},                    null,           /unexpected value/ ],
            [ 7,                                            {},                    null,           /unexpected value/ ],
        ],
        function (tprops, transform, opt) {
            typobj.typ2obj(tprops, function (name) { return transform[name] }, opt)
        },
        { assert: 'throws' }
    )
})

test('typ2obj simple', function (t) {
    var simple = Object.keys(CODES).filter(function (name) { return !{ int: 1, obj: 1, arr: 1 }[name] })
    simple.forEach(function (name) {
        var type = tbase.create({base: name, name: name})
        var obj = typobj.typ2obj(type, function (n) { return n })
        t.same(obj, name, t.desc('', [name], name))
    })
    simple.forEach(function (name) {
        var type = tbase.create({base: name, name: 'foo'})
        var obj = typobj.typ2obj(type, function (n) { return n })
        var exp = { '$base': name, $name: 'foo' }
        t.same(obj, exp, t.desc('', [name], exp))
    })
    t.end()
})

