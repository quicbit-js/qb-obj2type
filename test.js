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
            [ [ 'i' ],                                                      [ 'int' ] ],
            [ ['*','N','X','a','b','d','f','i','m','n','o','s','t','x'],    [ '*', 'nul', 'blb', [], 'boo', 'dec', 'flt', 'int', 'mul', 'num', {}, 'str', 'typ', 'byt' ] ],
            [ {},                                                           {} ],
            [ { $base: 'o', '*':'*' },                           { '*': '*' } ],
            [ { $base: 'o', id: 'n' },                                      { id: 'num' } ],
            [ { $base: 'integer' },                                         { $base: 'int' } ],
            [ { id: 'number' },                                             { id: 'num' } ],
            [ { base: 'obj', id: 'n' },                                     { base: {}, id: 'num' } ],         // 'base' as a plain custom field
            [ [ { a: 's'} ],                                                [ { a: 'str' } ] ],
            [ [ { a: [{},[],'nul']} ],                                      [ { a: [{}, [], 'nul'] } ] ],
            [ [ { a: []} ],                                                 [ { a: [] } ] ],
            [ [ { a: [ 'i', 'n' ]} ],                                       [ { a: [ 'int', 'num' ] } ] ],
            [ { a: 'int', b: {x: 'string', y: ['int'] } },                  { a: 'int', b: { x: 'str', y: ['int'] } } ],
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
            var info = typobj.obj2typ(obj)
            return {
                root: info.root.obj(),
                names: Object.keys(info.byname),
                unresolved: Object.keys(info.unresolved)
            }
        }
    )
})

test('obj2type - example', function (t) {
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
            var info = typobj.obj2typ(obj)
            return {
                root: info.root.obj(),
                names: Object.keys(info.byname),
                unresolved: Object.keys(info.unresolved)
            }
        }
    )
})

