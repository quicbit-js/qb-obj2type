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
var typbase = require('qb1-type-base')
var CODES = typbase.CODES
var typobj = require('.')

var base_types_by_name = typbase.types().reduce(function (m, t) {
    m[t.name] = t
    m[t.tinyname] = t
    m[t.fullname] = t
    return m
})

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


test('obj_by_name - no-name', function (t) {
    var typ_trans = function (n) { return base_types_by_name[n].name }
    t.table_assert(
        [
            [ 'obj',                            'exp' ],
            [ 'str',                            'str' ],
            [ 's',                              'str' ],
            [ 'i',                              'int' ],
            [ {},                               { base: 'obj' } ],
            [ { $t: 't' },                      { base: 'obj' } ],
            [ { $typ: 't' },                    { base: 'obj' } ],
            [ { $type: 'typ' },                 { base: 'obj' } ],
            [ { $base: 'obj' },                 { base: 'obj' } ],
            [ { $base: 'int' },                 { base: 'int' } ],
            [ { $base: 'str' },                 { base: 'str' } ],
            [ { $v: 'str' },                    'str' ],
            [ { id: 'number' },                 { base: 'obj', fields: { id: 'num' } } ],
            [ { $base: 'obj', id: 'n' },        { base: 'obj', fields: { id: 'num' } } ],
            [ { base: 'obj', id: 'n' },         { base: 'obj', fields: { base: 'obj', id: 'num' } } ],
            [ [],                               { base: 'arr', items: [] } ],
            [ [ 'i' ],                          { base: 'arr', items: [ 'int' ] } ],
            [ [ { a: 's'} ],                    { base: 'arr', items: [ { base: 'obj', fields: { a: 'str' } } ] } ],
            [ [ { a: [ 'i', 'n' ]} ],           { base: 'arr', items: [ { base: 'obj', fields: { a: { base: 'arr', items: [ 'int', 'num' ] } } } ] } ],
            [ { a: 'int', b: {x: 'string', y: ['int'] } },    { base: 'obj', fields: { a: 'int', b: { base: 'obj', fields: { x: 'str', y: { base: 'arr', items: ['int'] } } } } } ],
        ],
        function (obj) {
            var info = typobj._obj_by_name(obj, typ_trans)
            Object.keys(info.byname).length === 0 || err('byname should be empty')
            return info.root
        }
    )
})

test('obj_by_name - errors', function (t) {

    var types = {
        i: 'int',
        int: 'int',
        o: 'obj',
        obj: 'obj',
        s: 'str',
        str: 'str',
        t: 'typ',
        typ: 'typ',
        v: 'val',
        val: 'val',
    }
    var typ_trans = function (n) { return types[n] || n }
    t.table_assert([
        [ 'obj',                                  'typ_transform',              'exp' ],
        [ { $base: 'obj', $v: 'str' },            typ_trans,                    /properties are not allowed/ ],
    ], typobj._obj_by_name, {assert: 'throws'})
})

test('obj_by_name - named', function (t) {
    t.table_assert(
        [
            [
                'obj',
                'name_map',
                'exp',
            ],
            // $value written to parent
            // [
            //     { $t: 'type', $v: { $n: 'xtype', $d: 'an example type', $base: 'i' } },
            //     { i: 'int' },
            //     { root: 'xtype', byname: { xtype: { base: 'int', name: 'xtype', desc: 'an example type' } } }
            // ],
            // [
            //     { $t: 'type', $n: 'xtype', $d: 'an example type', $base: 'i' },
            //     { i: 'int' },
            //     { root: 'xtype', byname: { xtype: { base: 'int', name: 'xtype', desc: 'an example type' } } }
            // ],
            // [
            //     { $n: 'xtype', $d: 'an example type', $base: 'i' },
            //     { i: 'int' },
            //     { root: 'xtype', byname: { xtype: { base: 'int', name: 'xtype', desc: 'an example type' } } }
            // ],
            [
                // unnamed object
                { a: 'int', b: {x: 'string', y: ['int'] } },
                { string: 'str' },
                { root: { base: 'obj', fields: { a: 'int', b: { base: 'obj', fields: { x: 'str', y: { base: 'arr', items: ['int'] } } } } }, byname: {} }
            ],
            // [
            //     {
            //         $name: 't1', $description: 'a test type',
            //         a: 'int',
            //         b: {
            //             x: 'str',
            //             y: ['int']
            //         },
            //         c: 'foo'
            //     },
            //     { t1: 't1', foo: 'fooby' },
            //     {
            //         root: 't1',
            //         byname: {
            //             t1: {
            //                 base: 'obj',
            //                 name: 't1', desc: 'a test type',
            //                 fields: {
            //                     a: 'int',
            //                     b: {
            //                         base: 'obj',
            //                         fields: {
            //                             x: 'str',
            //                             y: {base: 'arr', items: ['int']}
            //                         }
            //                     },
            //                     c: 'fooby'
            //                 }
            //             }
            //         }
            //     }
            // ],
            // [
            //     // keep stipulations intact (non-type args)
            //     {
            //         $name: 't1',
            //         a: 'int',
            //         b: {
            //             x: 'str',
            //             y: ['int']
            //         },
            //         $stip: { $n: 'x', string: 'int' }
            //     },
            //     { t1: 't1', x: 'x' },
            //     {
            //         root: 't1',
            //         byname: {
            //             t1:    {
            //                 name: 't1',
            //                 base: 'obj',
            //                 fields: {
            //                     a: 'int',
            //                     b: {
            //                         base: 'obj',
            //                         fields: {
            //                             x:'str',
            //                             y: {
            //                                 base: 'arr',
            //                                 items: ['int']
            //                             }
            //                         }
            //                     }
            //                 },
            //                 stip: { $n: 'x', string: 'int' }
            //             }
            //         }
            //     }
            // ],
            // [
            //     {
            //         $name: 't1',
            //         a: 'int',
            //         b: {
            //             $name: 't2',
            //             x: 'str',
            //             y: ['int'],
            //             c: 'xt'
            //         }
            //     },
            //     // [ { $n: 'xt', $d: 'an example type', $t: 'i' } ],  - need tset.put() to fix this
            //     { xt: 'xtype', t1: 't1', t2: 't2' },
            //     {
            //         root: 't1',
            //         byname: {
            //             t1: {
            //                 name: 't1',
            //                 base: 'obj',
            //                 fields: {
            //                     a: 'int',
            //                     b: 't2' }
            //             },
            //             t2: {
            //                 name: 't2',
            //                 base: 'obj',
            //                 fields: {
            //                     x: 'str',
            //                     y: {
            //                         base: 'arr',
            //                         items: [ 'int' ]
            //                     },
            //                     c: 'xtype'
            //                 }
            //             }
            //         }
            //     }
            // ]
        ],
        function (obj, name_map) {
            var name_transform = function (n) {
                return name_map[n] || n
            }

            return typobj._obj_by_name(obj, name_transform)
        }
    )
})

test('obj2typ', function (t) {
    t.table_assert(
        [
            [ 'o',                              'transform',                    'exp' ],
            // [
            //     { $value: ['i'] },
            //     { a: 'arr', i: 'int' },
            //     { base: 'arr', items: ['i'] }
            // ],

            [
                { $base: 'a', $items: ['i'] },
                { a: 'arr', i: 'int' },
                { base: 'arr', items: ['int'] }
            ],


            // [
            //     { $value: {base: 'a', items: ['i']} },
            //     { a: 'arr', i: 'int' },
            //     { base: 'arr', items: ['i'] }
            // ],
            // [
            //     { $value: {base: 'a', items: ['i']} },
            //     { a: 'arr', i: 'int' },
            //     { base: 'arr', items: ['i'] }
            // ],
            [ {a:'s', b:'i'},                   {s:'str',i:'int'},              { base: 'obj', fields: { a: 'str', b: 'int' }, expr: {} } ],
            [ {$t:'t', a:'s', b:'i'},           {t:'typ',s:'str',i:'int'},      { base: 'obj', fields: { a: 'str', b: 'int' }, expr: {} } ],                // $type is optional
            [ {},                               {},                             { base: 'obj', fields: {}, expr: { '*': '*' } } ],
            [ {$n:'foo', a:'s', b:'i'},         {s:'str',i:'int'},              { base: 'obj', name: 'foo', tinyname: 'foo', fullname: 'foo', fields: { a: 'str', b: 'int' }, expr: {} } ],
            [ {a:'s', 'b*':'i'},                {s:'str',i:'int'},              { base: 'obj', fields: { a: 'str' }, expr: { 'b*': 'int' } } ],
            [
                { $n:'foo', $tn:'fo', $fn:'fooo', a:'s', 'b*':'i' },
                { s:'s', i:'i' },
                { base: 'obj', name: 'foo', tinyname: 'fo', fullname: 'fooo', expr: { 'b*': 'i' }, fields: { a: 's' } }
            ],
            [
                { $n:'foo', a:'s', 'b*':{ $n:'int', $base: 'int'} },
                { s:'s', i:'i' },
                { base: 'obj', name: 'foo', tinyname: 'foo', fullname: 'foo', expr: { 'b*': 'int' }, fields: { a: 's' } }
            ],
            [ ['o','s'],                        {o:'o',s:'s'},    { base: 'arr', items: [ 'o', 's' ] } ],
        ],
        function (o, transform) {
            var typ_trans = function (v) { return transform[v] }
            var info = typobj.obj2typ(o, typ_trans)
            var obj = typeof info.root === 'string' ? info.byname[info.root] : info.root
            return qbobj.map(obj, null, null, {deep: ['base']})
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
            [ 'str',                                    {},                             /expected an object/ ],
            [ null,                                     {},                             /expected an object/ ],
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
            [ {base:'obj', fields:{}, expr:{}},             {},                         null,           {} ],
            [ {base:'obj', fields:{}, expr:{'*':'*'}},      {},                         null,           {} ],
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
            [ {base:'obj', name:'foo', expr:{'a*':'i'}},    {i:'i'},                    null,            { $name: 'foo', 'a*': 'i' } ],
            [ {base:'arr', items:['i','s']},                {arr: 'a', i:'i',s:'s'},    null,            [ 'i', 's' ] ],
            [ {base:'arr', name:'foo', items:['i','s']},    {arr: 'a', i:'i',s:'s'},    null,            { $base: 'a', $name: 'foo', $items: ['i','s']} ],
            [ {base:'arr', name:'foo', items:['i','s']},    {arr: 'a', i:'i',s:'s'},    {incl:{name:1}}, { $name: 'foo', $items: ['i','s']} ],
            [ {base:'arr', name:'foo', items:['i','s']},    {arr: 'a', i:'i',s:'s'},    {excl:{name:1}}, [ 'i', 's' ] ],
            [ {base:'arr', name:'arr'},                     {'*':'*'},                  null,            [] ],
            [ {base:'obj', name:'obj'},                     {},                         null,            {} ],
        ],
        function (tprops, transform, opt) {
            var type = typbase.create(tprops)
            var ret = typobj.typ2obj(type, function (name) {
                return transform[name]
            }, opt)
            if (typeof ret === 'object' && !Array.isArray(ret)) {
                ret = qbobj.map(ret)
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
        var type = typbase.create({base: name, name: name})
        var obj = typobj.typ2obj(type, function (n) { return n })
        t.same(obj, name, t.desc('', [name], name))
    })
    simple.forEach(function (name) {
        var type = typbase.create({base: name, name: 'foo'})
        var obj = typobj.typ2obj(type, function (n) { return n })
        var exp = { '$base': name, $name: 'foo' }
        t.same(obj, exp, t.desc('', [name], exp))
    })
    t.end()
})

