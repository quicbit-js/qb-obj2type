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

var tbase = require('qb1-type-base')
var BASE_CODES = tbase.CODES
var assign = require('qb-assign')
var qbobj = require('qb1-obj')
var TCODES = qbobj.TCODES

// return true if string s has character c and is not preceded by an odd number of consecutive escapes e)
function has_char (s, c, e) {
    var i = 0
    while ((i = s.indexOf(c, i)) !== -1) {
        for (var n = 1; s[i-n] === e; n++) {}  // c = preceeding escape count (+1)
        if (n % 2) {
            return true
        }
        i++
    }
    return false
}

// return true if basic type properties have been set and will be shown
function has_props (t, opt) {
    if (t.name === t.base) {
        return false
    }
    var excl = opt.excl
    var incl = opt.incl

    // no need to check fullname and tinyname when name is checked
    return ['name', 'desc', 'stip'].find(function (p) {
        return t[p] && !(excl && excl[p]) && (!incl || incl[p])
    })
}

function copy_type_props (src, dst, opt) {
    copy_prop('name', src.name, dst, opt)
    copy_prop('desc', src.desc, dst, opt)
    if (src.tinyname !== src.name) {
        copy_prop('tinyname', src.tinyname, dst, opt)
    }
    if (src.fullname !== src.name) {
        copy_prop('fullname', src.fullname, dst, opt)
    }
    copy_prop('stip', src.stip, dst, opt)
}

// sets $-property according to the opt.excl, opt.incl and opt.tnf settings
function copy_prop (n, v, dst, opt) {
    if (v == null || opt.excl && opt.excl[n]) {
        return
    }
    if (!opt.incl || opt.incl[n]) {
        if (opt.tnf && opt.tnf !== 'name') {
            n = tbase.PROPS_BY_NAME[n][opt.tnf]
        }
        dst['$' + n] = v
    }
}

// return a map of ($-prefixed) prop names to prop.name
// $s -> stip,          $stip -> stip,         $stipulations -> stip, ...
function dprops_map () {
    return qbobj.map(
        tbase.PROPS_BY_NAME,
        function (name) { return '$' + name },
        function (name, prop) { return prop.name }
    )
}

// map for fast collection of name properties
var NAME_PROPS = {
    '$n':        1,
    '$fn':       1,
    '$tn':       1,
    '$name':     1,
    '$tinyname': 1,
    '$fullname': 1,
}

// return a map of all names within the object ($tinyname, $fullname, $name) mapped to the name.
function collect_names(obj) {
    return qbobj.walk(obj, function (carry, k, i, tcode, v, path) {
        if (tcode === TCODES.OBJ) {
            Object.keys(v).forEach(function (vk) {
                if (NAME_PROPS[vk]) {
                    var name = v[vk]
                    typeof name === 'string' || err('illegal type for ' + path.join('/') + '/' + vk + ': ' + (typeof name))
                    !carry[name] || err('name used more than once: ' + name)
                    carry[name] = v.$n || v.$name || err('missing name: ' + path.join('/'))    // tinyname and fullname require a normal name
                }
            })
        }
        return carry
    }, {})
}

// Find all named types within the given type array or object (nested), collect them in an object and replace
// them with name string references.  return:
//
//      {
//          root:       the root object reference or object itself (if unnamed)
//          byname:     named objects by name
//      }
//
// While traversing, update all property names to the prop.name (from tiny or long forms) checking and removing the
// '$' prefix and collect custom properties (non-dollar) into 'fields' and 'expr' objects, preparing for type creation.
// see tests for output examples.
function obj_by_name(obj, typ_transform) {
    // normalize property names.  e.g. $n -> name, $type -> type...
    var dprops = dprops_map()
    var ret = { root: null, byname: {} }                     // put root object and named types into this result
    qbobj.walk(obj, function (carry, k, i, tcode, v, path, pstate, control) {
        var parent = pstate[pstate.length-1]
        var propkey
        var fieldkey
        if (k) {
            if (k[0] === '$') {
                propkey = dprops[k] || err('unknown property: ' + k)   // remove '$' and give normal name
            } else {
                fieldkey = k
            }
        }
        var nv = v                              // default v for any missing case, including 'skip'

        // create substitute containers for array, plain record fields, and $type values
        if (!k || fieldkey || propkey === 'name' || propkey === 'type' || propkey === 'base') {
            switch (tcode) {
                case TCODES.ARR:
                    nv = { base: 'arr', items: [] }
                    pstate.push(nv)
                    break
                case TCODES.OBJ:
                    nv = { base: 'rec' }     // assume 'record' until proven otherwise (if expression is found or is set with property, below)
                    pstate.push(nv)
                    var obj_name = v.$n || v.$name
                    if (obj_name) {
                        // replace named value with a normalized reference
                        obj_name = typ_transform(obj_name, path)        // todo: needed?
                        ret.byname[obj_name] = nv
                        nv = obj_name
                    }
                    break
                case TCODES.STR:
                    // string is a type name
                    nv = typ_transform(v, path)
                    break
                // default: nv is v
            }
        } else {
            // non-type field
            control.walk = 'skip'
        }

        if (parent) {
            if (propkey) {
                // type property
                parent[propkey] = nv
            } else if (fieldkey) {
                // record field or object expression
                if (has_char(fieldkey, '*', '^')) {
                    if (!parent.expr) {
                        parent.base = 'obj'             // has expression key(s) - set base to 'obj'
                        parent.expr = {}
                    }
                    parent.expr[fieldkey] = nv
                } else {
                    if (!parent.fields) {
                        parent.fields = {}
                    }
                    parent.fields[fieldkey] = nv
                }
            } else {
                // array value
                parent.items[i] = nv
            }
        } else {
            ret.root = nv       // nv is a string for named root, object for unnamed root
        }
    }, null)
    return ret
}

// convert an object to a set of types by name using the given tset to interpret types.  return the root object and types by name as an object:
// { root: ..., byname: types-by-name }
function obj2typ (o, typ_transform) {
    typeof o === 'object' || err('expected object but got: ' + (typeof o))
    // other types are in user-object form
    var names_map = collect_names(o)
    var trans = function (n, path) {
        return names_map[n] || typ_transform(n) || err('unknown type: ' + path.concat(n).join('/'))
    }

    var ret = obj_by_name(o, trans)        // reduce/simplify nested structure

    ret.byname = qbobj.map(ret.byname, null, function (n, props) { return tbase.create(props) })
    if (ret.root.base) { ret.root = tbase.create(ret.root) }

    return ret
}

function typ2obj (t, typ_transform, opt) {
    var ret
    switch (t.code) {
        case BASE_CODES.arr:
            var items = t.items.map(function (item) { return typ2obj(item, typ_transform, opt)})

            // return a simple array if there is only one property (the base)
            if (has_props(t, opt)) {
                ret = {}
                copy_prop('base', typ2obj(t.base, typ_transform, opt), ret, opt)
                copy_type_props(t, ret, opt)
                ret.$items = items
            } else {
                ret = items
            }
            break
        case BASE_CODES.obj: case BASE_CODES.rec:
            ret = {}
            if (t.name !== t.base) {
                copy_type_props(t, ret, opt)
            }
            qbobj.map(t.fields, null, function (k,v) { return typ2obj(v, typ_transform, opt) }, {init: ret})
            if (t.code === BASE_CODES.obj) {
                qbobj.map(t.expr, null, function (k,v) { return typ2obj(v, typ_transform, opt) }, {init: ret})
            }
            break
/*
        [ null,  '*',       'any',     'Represents any value or type.  For example, [*] is an array of anything' ],
            [ 'a',   'arr',     'array',   'Array of values matching types in a *cycle* (also see multi type).  [str] is an array of strings while [str, int] is an alternating array of [str, int, str, int, ...]' ],
            [ 'X',   'blb',     'blob',    'A sequence of bytes' ],
            [ 'b',   'boo',     'boolean', 'A true or false value.  Also can be a 0 or non-zero byte' ],
            [ 'x',   'byt',     'byte',    'An integer in range 0..255'   ],
            [ 'd',   'dec',     'decimal', 'An unbounded base-10 number (range ~~)' ],
            [ 'f',   'flt',     'float',   'An unbounded base-2 number (range ~~)' ],
            [ 'i',   'int',     'integer', 'An unbounded integer (range ..)' ],
            [ 'm',   'mul',     'multi',   'A set of possible types in the form t1|t2|t3, (also see array cycling types)'   ],
            [ 'n',   'num',     'number',  'Any rational number including decimals, floats, and integers' ],
            [ 'o',   'obj',     'object',  'An object with flexible keys and flexible or fixed types which may be constrained using *-expressions'  ],   //  values must be as key/value pairs and the order in the value is the only order known.
            [ 'r',   'rec',     'record',  'An object with fixed keys and types such as { field1: str, field2: [int] }' ],   //  order is known so values can be without keys (in order) or with keys (in any order)
            [ 's',   'str',     'string',  'A string of unicode characters (code points in range 0..1114111)'  ],   // (1-3 chained bytes, 7-21 bits)
            [ 't',   'typ',     'type',    'When type is used as a value, it represents of of the types in this list or any referenceable or registered type'  ],
            [ 'F',   'fal',     'false',   'False boolean value' ],
            [ 'N',   'nul',     'null',    'A null value which represents "not-set" for most situations' ],
            [ 'T',   'tru',     'true',    'True boolean value' ],*/

        case BASE_CODES['*']:
        case BASE_CODES.blb: case BASE_CODES.boo: case BASE_CODES.byt: case BASE_CODES.dec:
        case BASE_CODES.flt: case BASE_CODES.int: case BASE_CODES.mul: case BASE_CODES.num:
        case BASE_CODES.str: case BASE_CODES.typ: case BASE_CODES.nul:
        case BASE_CODES.tru: case BASE_CODES.fal:
            if (t.name === t.base) {
                ret = t[opt.tnf]            // base types as string
            } else {
                ret = {}
                copy_prop('base', typ2obj(t.base, typ_transform, opt), ret, opt)
                copy_type_props(t, ret, opt)
            }
            break;
        default:
            typeof t === 'string' || err('unexpected value: ' + t)
            ret = typ_transform(t, opt) || err('unknown type: ' + t)
    }
    return ret
}

function err (msg) { throw Error(msg) }

module.exports = {
    _has_char: has_char,
    _obj_by_name: obj_by_name,
    obj2typ: obj2typ,
    typ2obj: function( v, typ_transform, opt ) { return typ2obj(v, typ_transform, assign({ tnf: 'name' }, opt)) }
}
