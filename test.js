// Software License Agreement (ISC License)
//
// Copyright (c) 2017-2018, Matthew Voss
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
var obj2type = require('.')

function err (msg) { throw Error(msg) }

test('obj2typ - basic', function (t) {
    t.table_assert(
        [
            [ 'obj',                                                        'exp' ],
            [ 's',                                                          'str' ],
            [ 'str',                                                        'str' ],
            [ 'string',                                                     'str' ],
            [ { $type:'typ', $value: 's' },                                 'str' ],
            [ { $type:'typ', $value: 'str' },                               'str' ],
            [ { $type:'typ', $value: 'string' },                            'str' ],
            [ { $base: 's' },                                               { $base: 'str' } ],
            [ { $base: 'str' },                                             { $base: 'str' } ],
            [ { $base: 'string' },                                          { $base: 'str' } ],
            [ [],                                                           [] ],
            [ { $base: 'array'},                                            ['any'] ],        // functionally equivalent to base [], but a custom copy
            [ { $a: ['*']},                                                 ['any'] ],        // functionally equivalent to base [], but a custom copy
            [ [ 'i' ],                                                      [ 'int' ] ],
            // not multi-type - (which is not a concrete type)
            [ ['*','N','X','a','b','d','f','i','n','o','s','t','x'],        [ 'any', 'nul', 'blb', [], 'boo', 'dec', 'flt', 'int', 'num', {}, 'str', 'typ', 'byt' ] ],
            [ {},                                                           {} ],
            [ { $base: 'object' },                                          {'*':'any'} ],        // functionally equivalent to plain object {}, but a custom copy
            [ { $base: 'obj', '*':'*' },                                    {'*':'any'} ],        // functionally equivalent to plain object {}, but a custom copy
            [ { $base: 'o', id: 'n' },                                      { id: 'num' } ],
            [ { $base: 'integer' },                                         { $base: 'int' } ],
            [ { id: 'number' },                                             { id: 'num' } ],
            [ { $array: ['i','s']},                                         [ 'int','str'] ],
            [ { $multi: ['i','N']},                                         { $mul: ['int', 'nul']} ],
            [ { base: 'obj', id: 'n' },                                     { base: {}, id: 'num' } ],         // note, NOT $base, but a plain 'base' custom field
            [ [ { a: 's'} ],                                                [ { a: 'str' } ] ],
            [ [ { a: [{},[],'nul']} ],                                      [ { a: [{}, [], 'nul'] } ] ],
            [ [ { a: []} ],                                                 [ { a: [] } ] ],
            [ [ { a: [ 'i', 'n' ]} ],                                       [ { a: [ 'int', 'num' ] } ] ],
            [ { a: 'int', b: {x: 'string', y: ['int'] } },                  { a: 'int', b: { x: 'str', y: ['int'] } } ],
        ],
        function (obj) {
            var info = obj2type(obj)
            Object.keys(info.defined_types).length === 0 || err('defined_types should be empty')
            Object.keys(info.unresolved).length === 0 || err('unresolved should be empty')
            return info.root.to_obj({name_depth:0})
        }
    )
})

test('obj2typ - opt', function (t) {
    t.table_assert(
        [
            [ 'obj',                        'opt',                              'exp' ],
            [ { $hash: 5, a: 's' },         {custom_props: {$hash:'hash'}},     { $hash: 5, a: 'str' } ],
            [ { $hash: 5, $arr: ['n'] },    {custom_props: {$hash:'hash'}},     { $hash: 5, $arr: ['num'] } ],
        ],
        function (obj, opt) {
            var info = obj2type(obj, opt)
            Object.keys(info.defined_types).length === 0 || err('defined_types should be empty')
            Object.keys(info.unresolved).length === 0 || err('unresolved should be empty')
            return info.root.to_obj({name_depth:0})
        }
    )
})

test('obj2typ - errors', function (t) {
    t.table_assert([
        [ 'obj',                                                    'opt',    'exp' ],
        [ { $v: { b: 's' } },                                       null,     /missing \$type property/ ],
        [ { $t:'t', a: 'i' },                                       null,     /missing \$value property/ ],
        [ { $t:'tup', $v: 'i' },                                    null,     /expected type "type"/ ],
        [ { $t:'t', $v: 'i', a: 's' },                              null,     /\$type\/value form does not allow other type properties/ ],
        [ { a: null },                                              null,     /missing value/ ],
        [ { a: 'mul' },                                             null,     /multi type "mul" is not a stand-alone type/ ],
        [ { $milti: ['int','str'] },                                null,     /unknown property at \$milti/ ],
        [ { $base: 'foo' },                                         null,     /unknown base type/ ],
        [ { $multi: ['str', 7 ] },                                  null,     /unexpected value/ ],
        [ { $multi: ['str', 'int' ], a: 'boo' },                    null,     /custom \(non-\$\) fields are only supported for objects/ ],
        [ { $base: 'obj', $multi: ['str','int'] },                  null,     /mismatched base.  expected mul/ ],
        [ { $base: 'obj', $array: ['int'], $multi: ['str','int'] }, null,     /mul cannot be set together with arr/ ],
        [ { $base: 'obj', $name: 'o', $tn: 'x', a: 'int'},          null,     /name 'o' is a base type name/ ],
        [ { $base: 'obj'},        {fresh_copy:false, link_children:true},     /cannot link_children in type tree if fresh_copy is false/ ],
    ], obj2type, {assert: 'throws'})
})

test('obj2type - named', function (t) {
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
            var info = obj2type(obj)
            return {
                root: info.root.to_obj({name_depth: 1}),
                names: Object.keys(info.defined_types),
                unresolved: Object.keys(info.unresolved)
            }
        }
    )
})

test('obj2typ - copy', function (t) {
    var tobj = {a: 's', x:['i'], b: ['s'], c: {$mul: ['i', 's']}}
    var typ1 = obj2type(tobj, {fresh_copy: false}).root
    t.same(typ1.fields.a.name, 'str')
    t.same(typ1.fields.b.arr[0].name, 'str')
    t.equal(typ1.fields.a, typ1.fields.b.arr[0])

    t.same(typ1.fields.c.mul[1].name, 'str')
    t.equal(typ1.fields.a, typ1.fields.c.mul[1])

    var typ2 = obj2type(tobj).root
    t.same(typ2.fields.a.name, 'str')
    t.same(typ2.fields.b.arr[0].name, 'str')
    t.not(typ2.fields.a, typ2.fields.b.arr[0])

    t.same(typ2.fields.c.mul[1].name, 'str')
    t.not(typ2.fields.a, typ2.fields.c.mul[1])

    t.end()
})

test ('obj2typ invisible multi-type', function (t) {
    // to support dynamically adding to multi-type, we gracefully handle multi-types with only a single item...
    // by converting to single type.
    t.table_assert(
        [
            [ 'obj',                                                            'exp' ],
            [ { $multi: ['i'] },                                                'int' ],
            [ { $multi: [['i']] },                                              [ 'int' ] ],
            [ [ { $mul: ['i'] } ],                                              [ 'int' ] ],
            [ [ { a: { $m: ['i'] } } ],                                         [ { a: 'int' } ] ],
        ],
        function (obj) {
            var info = obj2type(obj)
            Object.keys(info.defined_types).length === 0 || err('defined_types should be empty')
            Object.keys(info.unresolved).length === 0 || err('unresolved should be empty')
            return info.root.to_obj({name_depth:0})
        }
    )
})

test('obj2typ - example', function (t) {
    t.table_assert(
        [
            [ 'obj',                                        'exp' ],
            [
                { '*':
                    {
                        name: 's',
                        description: 's',
                        maintainers: [],
                        keywords: ['s'],
                        author: { name: 's', email: 's' }
                    }
                },
                {
                    root: {
                        '*': {
                            name: 'str',
                            description: 'str',
                            maintainers: [],
                            keywords: [ 'str' ],
                            author: { name: 'str', email: 'str' } } },
                    names: [],
                    unresolved: []
                }
            ],
        ],
        function (obj) {
            var info = obj2type(obj)
            return {
                root: info.root.to_obj(),
                names: Object.keys(info.defined_types),
                unresolved: Object.keys(info.unresolved)
            }
        }
    )
})

