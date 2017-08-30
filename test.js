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

test('obj_by_name', function (t) {
    t.table_assert(
        [
            [
                'obj',
                'name_map',
                'exp',
            ],
            [
                { $n: 'xt', $d: 'an example type', $base: 'i' },
                { xt: 'xtype', i: 'int' },
                { root: 'xtype', byname: { xtype: { base: 'int', name: 'xtype', desc: 'an example type' } } }
            ],
            [
                // unnamed object
                { a: 'int', b: {x: 'string', y: ['int'] } },
                { string: 'str' },
                { root: { base: 'rec', fields: { a: 'int', b: { base: 'rec', fields: { x: 'str', y: { base: 'arr', items: ['int'] } } } } }, byname: {} }
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
                { t1: 't1', foo: 'fooby' },
                {
                    root: 't1',
                    byname: {
                        t1: {
                            base: 'rec',
                            name: 't1', desc: 'a test type',
                            fields: {
                                a: 'int',
                                b: {
                                    base: 'rec',
                                    fields: {
                                        x: 'str',
                                        y: {base: 'arr', items: ['int']}
                                    }
                                },
                                c: 'fooby'
                            }
                        }
                    }
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
                { t1: 't1', x: 'x' },
                {
                    root: 't1',
                    byname: {
                        t1:    {
                            name: 't1',
                            base: 'rec',
                            fields: {
                                a: 'int',
                                b: {
                                    base: 'rec',
                                    fields: {
                                        x:'str',
                                        y: {
                                            base: 'arr',
                                            items: ['int']
                                        }
                                    }
                                }
                            },
                            stip: { $n: 'x', string: 'int' }
                        }
                    }
                }
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
                // [ { $n: 'xt', $d: 'an example type', $t: 'i' } ],  - need tset.put() to fix this
                { xt: 'xtype', t1: 't1', t2: 't2' },
                {
                    root: 't1',
                    byname: {
                        t1: {
                            name: 't1',
                            base: 'rec',
                            fields: {
                                a: 'int',
                                b: 't2' }
                        },
                        t2: {
                            name: 't2',
                            base: 'rec',
                            fields: {
                                x: 'str',
                                y: {
                                    base: 'arr',
                                    items: [ 'int' ]
                                },
                                c: 'xtype'
                            }
                        }
                    }
                }
            ]
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
            [ 'o',                              'transform',       'exp'],
            [ {a:'s', b:'i'},                   {s:'s',i:'i'},    { base: 'rec', fields: { a: 's', b: 'i' } } ],
            [ {a:'s', 'b*':'i'},                {s:'s',i:'i'},    { base: 'obj', expr: { 'b*': 'i' }, fields: { a: 's' } } ],
            [ {$n:'foo', a:'s', b:'i'},         {s:'s',i:'i'},    { base: 'rec', name: 'foo', tinyname: 'foo', fullname: 'foo', fields: { a: 's', b: 'i' } } ],
            [
                {$n:'foo', $tn:'fo', $fn:'fooo', a:'s', 'b*':'i'},
                {s:'s', i:'i'},
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
            var info = typobj.obj2typ(o, function (v) {
                return transform[v]
            })
            var obj = typeof info.root === 'string' ? info.byname[info.root] : info.root
            return qbobj.map(obj, null, null, {deep: ['base']})
        }
    )
})

test('typ2obj', function (t) {
    t.table_assert(
        [
            [ 'tprops',                                                          'transform',                'opt',          'exp'],
            [ 'str',                                        {},                         null,           'str' ],
            [ {base:'rec', name:'foo', fields:{a:'i'}},     {i:'i'},                    null,           { $name: 'foo', a: 'i'} ],
            [
                {base:'rec', name:'foo', tinyname: 'fo', fullname: 'fooo', fields:{a:'i'}},
                {i:'i'},
                null,
                { $name: 'foo', $tinyname: 'fo', $fullname: 'fooo', a: 'i' }
            ],
            [
                {base:'rec', name:'foo', tinyname: 'fo', fullname: 'fooo', fields:{a:'i'}},
                { i:'i' },
                { tnf: 'tinyname', excl:{tinyname:1} },
                { $n: 'foo', $fn: 'fooo', a: 'i' }
            ],
            [
                {base:'rec', name:'foo', tinyname: 'fo', fullname: 'fooo', fields:{a:'i'}},
                { i:'i' },
                { tnf: 'fullname', incl:{name:1} },
                { $name: 'foo', a: 'i' }
            ],
            [
                {base:'rec', name:'foo', tinyname: 'fo', fullname: 'fooo', fields:{a:'i'}},
                { i:'i' },
                { incl:{name:1}, excl:{name:1} },       // exclude overrides include
                { a: 'i' }
            ],
            [ {base:'obj', name:'foo', expr:{'a*':'i'}},    {i:'i'},                    null,           { $name: 'foo', 'a*': 'i' } ],
            [ {base:'arr', items:['i','s']},                {arr: 'a', i:'i',s:'s'},    null,           [ 'i', 's' ] ],
            [ {base:'arr', name:'foo', items:['i','s']},    {arr: 'a', i:'i',s:'s'},    null,           { $base: 'a', $name: 'foo', $items: ['i','s']} ],
            [ {base:'arr', name:'foo', items:['i','s']},    {arr: 'a', i:'i',s:'s'},    {incl:{name:1}},  { $name: 'foo', $items: ['i','s']} ],
            [ {base:'arr', name:'foo', items:['i','s']},    {arr: 'a', i:'i',s:'s'},    {excl:{name:1}},  [ 'i', 's' ] ],
            [ {base:'arr', name:'arr'},                     {'*':'*'},    null,                         [ '*' ] ],
            [ {base:'obj', name:'obj'},                     {'*':'*'},    null,                         {'*':'*'} ],
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

test('typ2obj simple', function (t) {
    var simple = Object.keys(CODES).filter(function (name) { return !{ rec: 1, obj: 1, arr: 1 }[name] })
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

