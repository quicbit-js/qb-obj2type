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
        for (var n = 1; s[i-n] === e; n++) {}  // n = preceeding escape count (+1)
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
function dprops_map (key_prefix) {
    return qbobj.map(
        tbase.PROPS_BY_NAME,
        function (name) { return key_prefix + name },
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

function valtype (v) {
    return v + ' ' + Object.prototype.toString.call(v)
}

function pathstr (path, n, v) {
    if (n != null) {
        path = path.concat(n)
    }
    return path.join('/') + (v ? ': ' + v : '')
}

function errp (msg, path, n, v) {
    err(msg + ' at ' + pathstr(path, n, v))
}

// return a map of all names within the object ($tinyname, $fullname, $name) mapped to the name.
function collect_names(obj) {
    return qbobj.walk(obj, function (carry, k, i, tcode, v, path) {
        if (tcode === TCODES.OBJ) {
            Object.keys(v).forEach(function (vk) {
                if (NAME_PROPS[vk]) {
                    var name = v[vk]
                    typeof name === 'string' || errp('illegal type ' + (typeof name), path, vk)
                    !carry[name] || errp('name used more than once', path, name)
                    carry[name] = v.$n || v.$name || errp('missing name prop', path)    // ensure name if tinyname or fullname are set
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
//
function obj_by_name (obj, typstr_transform) {
    // context is null, 'value', or 'fields' - influences interpretation of properties
    var info = { path: [], byname: {}, typstr_transform: typstr_transform }
    var root = process_any(null, obj, info, null)
    return { root: root, byname: info.byname }
}

// normalize property names.  e.g. $n -> name, $type -> type...
var DPROPS = dprops_map('$')

function process_any(k, v, info, val_dst) {
    v || errp('missing value', info.path, k)
    var ret
    switch (typeof v) {
        case 'object':
            if (k !== null) { info.path.push(k) }
            if (Array.isArray(v)) {
                ret = process_arr(v, info)
            } else {
                ret = process_obj(v, info, val_dst)
            }
            if (k !== null) { info.path.pop(k) }
            break
        case 'string':
            ret = info.typstr_transform(v, info.path) || errp('unknown type', info.path, k, v)
            break
        default:
            errp('unexpected value', info.path, k, valtype(v))
    }
    return ret
}

// a type object that may represent any type using base, value and custom (non-$) properties.
function process_obj (obj, info, val_dst) {
    var dst = val_dst || { base: null }        // collect normalized properties into this object, checking for collisions.  set base first because it's easier on the eyes when debugging

    // collect, check, and standardize property names while resolving fields and field expressions
    var special = { base: null, val: null, typ: null }  // use null as placeholder (not set yet, but is special prop)
    Object.keys(obj).forEach(function (k) {
        var v = obj[k]
        if (k[0] === '$') {
            var nk = DPROPS[k] || errp('unknown property', info.path, k)
            if (special[nk] !== undefined) {
                special[nk] = v
            } else {
                !dst[nk] || errp('property defined twice: under parent and within child', info.path, k)
                dst[nk] = v     // non-special properties are transferred to dst as-is (no change)
            }
        } else {
            if (has_char(k, '*', '^')) {
                if (!dst.expr) { dst.expr =  {} }
                !dst[k] || errp('expression defined twice', info.path, k)
                dst.expr[k] = v
            } else {
                if (!dst.fields) { dst.fields = {} }
                dst.fields[k] = v
            }
        }
    })

    if (special.typ) {
        info.typstr_transform(special.typ, info.path) === 'typ' || errp('expected type "type" but got ' + special.typ, info.path)
    }
    if (special.base) {
        dst.base = info.typstr_transform(special.base, info.path)
    }
    switch (dst.base) {
        case 'arr':
            dst.items || errp('array missing items', info.path)
            dst.items = dst.items.map(function (v, i) { return process_any(i, v, info) })
            break
        case 'obj': case null:
            if (dst.fields) {
                dst.fields = qbobj.map(dst.fields, null, function (k, v) { return process_any(k, v, info)} )
            }
            if (dst.expr) {
                dst.expr = qbobj.map(dst.expr, null, function (k, v) { return process_any(k, v, info)} )
            }
            break
        // other base types require no special handling
    }

    if (special.val) {
        Object.keys(dst).length === 1 && dst.base === null || errp('properties are not allowed with value ' + dst, info.path, '$val')
        dst = process_any ('$val', special.val, info, dst)
    } else {
        if (typeof dst === 'object') {
            dst.base = dst.base || 'obj'
        }
        // replace named objects with their names
        if (dst.name) {
            info.byname[dst.name] = dst
            dst = dst.name
        }
    }

    return dst
}

function process_arr (arr, info) {
    var items = arr.map(function (v,i) {
        return process_any(i, v, info)
    })
    return { base: 'arr', items: items }
}

// convert an object to a set of types by name using the given tset to interpret types.  return the root object and types by name as an object:
// { root: ..., byname: types-by-name }
function obj2typ (o, typstr_transform) {
    if (typeof o === 'string') {
        return { root: typstr_transform(o), byname: {} }
    }
    // other types are in user-object form
    var names_map = collect_names(o)        // todo: pass base types - do not allow override
    var ts_trans = function (n, path) {
        // allow new names to override established names (typstr_transform)
        return names_map[n] || typstr_transform(n) || errp('unknown type', path, n) // todo: check with base types
    }

    var ret = obj_by_name(o, ts_trans)        // convert arguments into standard properties, flattening named arguments.

    ret.byname = qbobj.map(ret.byname, null, function (n, props) { return tbase.create(props) })
    if (ret.root.base) { ret.root = tbase.create(ret.root) }

    return ret
}

function typ2obj (t, typstr_transform, opt) {
    var ret
    switch (t.code) {
        case BASE_CODES.arr:
            var items = t.is_generic() ? [] : t.items.map(function (item) { return typ2obj(item, typstr_transform, opt) })

            // return a simple array if there is only one property (the base)
            if (has_props(t, opt)) {
                ret = {}
                copy_prop('base', typ2obj(t.base, typstr_transform, opt), ret, opt)
                copy_type_props(t, ret, opt)
                ret.$items = items
            } else {
                ret = items
            }
            break
        case BASE_CODES.obj:
            ret = {}
            if (t.name !== t.base) {
                copy_type_props(t, ret, opt)
            }
            qbobj.map(t.fields, null, function (k,v) { return typ2obj(v, typstr_transform, opt) }, {init: ret})
            if (Object.keys(t.expr).length && !t.is_generic()) {
                qbobj.map(t.expr, null, function (k,v) { return typ2obj(v, typstr_transform, opt) }, {init: ret})
            }
            break
        case BASE_CODES['*']:
        case BASE_CODES.blb: case BASE_CODES.boo: case BASE_CODES.byt: case BASE_CODES.dec:
        case BASE_CODES.flt: case BASE_CODES.int: case BASE_CODES.mul: case BASE_CODES.num:
        case BASE_CODES.str: case BASE_CODES.typ: case BASE_CODES.nul:
        case BASE_CODES.tru: case BASE_CODES.fal:
            if (t.name === t.base) {
                ret = t[opt.tnf]            // base types as string
            } else {
                ret = {}
                copy_prop('base', typ2obj(t.base, typstr_transform, opt), ret, opt)
                copy_type_props(t, ret, opt)
            }
            break;
        default:
            typeof t === 'string' || err('unexpected value: ' + t)
            ret = typstr_transform(t, opt) || err('unknown type: ' + t)
    }
    return ret
}

function err (msg) { throw Error(msg) }

module.exports = {
    _has_char: has_char,
    _obj_by_name: obj_by_name,
    obj2typ: obj2typ,
    typ2obj: function( v, typstr_transform, opt ) { return typ2obj(v, typstr_transform, assign({ tnf: 'name' }, opt)) }
}
