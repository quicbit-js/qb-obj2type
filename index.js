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

// return true if significant user type properties have been set
function has_props (src) {
    return !!(src.name || src.desc || src.stip)  // src.name effectively covers tinyname and fullname as well
}
function copy_props (src, dst, opt) {
    set_prop('name', src.name, dst, opt)
    set_prop('desc', src.desc, dst, opt)
    if (src.tinyname && src.tinyname !== src.name) {
        set_prop('tinyname', src.tinyname, dst, opt)
    }
    if (src.fullname && src.fullname !== src.name) {
        set_prop('fullname', src.fullname, dst, opt)
    }
    set_prop('stip', src.stip, dst, opt)
    return dst
}

// sets $-property according to the opt.skip and opt.tnf settings
function set_prop (n, v, dst, opt) {
    if (v && !(opt.skip && opt.skip[n])) {
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
    typ_transform = typ_transform || function (n) { return n }
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
    // other types are in user-object form
    var names_map = collect_names(o)
    var trans = function (n, path) {
        return names_map[n] || typ_transform(n) || err('unknown type: ' + path.concat(n).join('/'))
    }

    var ret = obj_by_name(o, trans)        // reduce/simplify nested structure

    ret.byname = qbobj.map(ret.byname, null, function (n, obj) { return tbase.create(obj) })
    if (ret.root.base) { ret.root = tbase.create(ret.root) }

    return ret
}

function typ2obj (v, typ_transform, opt) {
    if (v == null) {
        return null
    }
    var ret = v
    switch (v.code) {
        case BASE_CODES.arr:
            if (v.isBase()) {
                return ['*']
            }
            var items = v.items.map(function (item) { return typ2obj(item, typ_transform, opt)})

            // return a simple array if there is only one property (the base)
            if (has_props(v)) {
                ret = {}
                set_prop('base', typ2obj(v.base, typ_transform, opt), ret, opt)
                copy_props(v, ret, opt)
                ret.$items = items
            } else {
                ret = items
            }
            break
        case BASE_CODES.obj: case BASE_CODES.rec:
        ret = copy_props(v, {}, opt)
        ret = qbobj.map(v.fields, null, function (k,v) { return typ2obj(v, typ_transform, opt) }, {init: ret})
        if (v.code === BASE_CODES.obj) {
            ret = qbobj.map(v.expr, null, function (k,v) { return typ2obj(v, typ_transform, opt) }, {init: ret})
        }
        break

        default:
            if (typeof v === 'string') {
                ret = typ_transform(v, opt) || err('unknown type: ' + v)
            } else {
                typeof v.code === 'number' || err('unexpected value: ' + v)
                if (v.isBase()) {
                    ret = v[opt.tnf]
                } else {
                    ret = {}
                    set_prop('base', typ2obj(v.base, typ_transform, opt), ret, opt)
                    copy_props(v, ret, opt)
                }
            }
    }
    return ret
}

module.exports = {
    obj2typ: obj2typ,
    _has_char: has_char,
    _obj_by_name: obj_by_name,
    typ2obj: function( v, typ_transform, opt ) { return typ2obj(v, typ_transform, assign({ tnf: 'name' }, opt)) }
}
