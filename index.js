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
var PROPS_BY_NAME = tbase.PROPS_BY_NAME
var BASE_TYPES_BY_NAME = tbase.TYPES_BY_NAME

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

function _typval2typ (props, opt, info) {
    // check and handle $type/$value form
    props.type || errp( 'missing $type property for $type/$value', info.path)
    props.value || errp('missing $value property for $type/$value', info.path)
    Object.keys(props).length === 2 || errp('$type/value form does not allow other type properties', info.path)
    var ttype
    (ttype = opt.lookupfn(props.type)) && ttype.name === 'typ' || errp('expected type "type" but got ' + ttype, info.path)
    return _any2typ('$value', props.value, opt, info)
}

// map to normalize property names.  e.g. $n -> name, $type -> type...
var DPROPS = dprops_map('$')

function _any2typ(k, v, opt, info) {
    v || errp('missing value', info.path, k)
    var ret
    switch (typeof v) {
        case 'object':
            var props = null
            if (k !== null) { info.path.push(k) }
            if (Array.isArray(v)) {
                props = _arr2props(v, opt, info)
            } else {
                props = _normalize_props(v, info)
                if (props.type || props.value) {
                    // set return - we are done
                    ret = _typval2typ(props, opt, info)
                } else {
                    var base = BASE_TYPES_BY_NAME[props.base || 'obj'] || errp('unknown base: ' + props.base, info.path)
                    props.base = base.name
                    props = _process_specific_props (props, opt, info)
                    props = inherit_base(props, base, info)
                }

            }
            if (!ret) {
                ret = opt.createfn(props)
                if (ret.name) {
                    info.byname[ret.name] = ret
                }
            }
            if (k !== null) { info.path.pop(k) }
            break
        case 'string':
            ret = opt.lookupfn(v)
            if (ret == null) {
                info.unresolved[v] = 1
                ret = v                     // leave as string for a second pass where we have all the types defined
            }
            break

        default:
            errp('unexpected value', info.path, k, valtype(v))
    }
    return ret
}

function inherit_base (tprops, base, info) {
    ['name', 'fullname', 'tinyname'].forEach(function (nameprop) {
        var name = tprops[nameprop]
        name == null || name !== base[name] || errp("property '" + nameprop + "' must be different for type and base", info.path )
    })
    if (base.stip) {
        !tprops.stip || err('stipulation merging not implemented')
        tprops.stip = base.stip
    }
    return tprops
}

// convert the type-specific expressions into types ($array, $multi, custom fields...)
function _process_specific_props (tprops, opt, info) {
    switch (tprops.base) {
        case 'arr':
            tprops.array = tprops.array || [ '*' ]
            tprops.array = tprops.array.map(function (v, i) { return _any2typ(i, v, opt, info) })
            break
        case 'obj':
            if (tprops.fields) {
                tprops.fields = qbobj.map(tprops.fields, null, function (k, v) { return _any2typ(k, v, opt, info)} )
            }
            if (tprops.pfields) {
                tprops.pfields = qbobj.map(tprops.pfields, null, function (k, v) { return _any2typ(k, v, opt, info)} )
            }
            break
        case 'mul':
            tprops.multi = tprops.multi.map(function (v,i) { return _any2typ(i, v, opt, info) })
            break
        // other base types don't have extra props
    }
    return tprops
}

// collect, check, and standardize property names.  note that no new properties are added when given
// a simple $type/$value object (properties are only added if custom fields or $array, $multi... are set).
function _normalize_props (obj, info) {
    var tprops = {}                 // type properties - can be passed to tbase.create() to create type objects
    var fields = {}                 // custom-fields
    var pfields = {}                // custom pattern fields (with '*')
    var base_exclusive = null
    var has_custom = false

    Object.keys(obj).forEach(function (k) {
        var v = obj[k]
        if (k[0] === '$') {
            var nk = DPROPS[k] || errp('unknown property', info.path, k)
            tprops[nk] = v
            // properties that set base - only one allowed
            if ({mul:1, arr:1}[nk]) {
                base_exclusive == null || errp(nk + ' cannot be set together with ' + base_exclusive, info.path)
                base_exclusive = nk
            }
        } else {
            has_custom = true
            if (has_char(k, '*', '^')) {
                pfields[k] = v
            } else {
                fields[k] = v
            }
        }
    })

    if (Object.keys(fields).length) { tprops.fields = fields }
    if (Object.keys(pfields).length) { tprops.pfields = pfields }

    if (tprops.base) {
        // normalize base (before comparing with base_exclusive)
        var base = BASE_TYPES_BY_NAME[tprops.base] || errp('unknown base type: ' + tprops.base, info.path)
        tprops.base = base.name
    }

    if (base_exclusive) {
        // fields like $array and $multi set the base to their value, but only one is allowed
        tprops.base == null || tprops.base === base_exclusive || errp('mismatched base.  expected ' + base_exclusive + ' but got: ' + tprops.base, info.path)
        !has_custom || err('custom (non-$) fields are only supported for objects, not ' + base_exclusive, info.path)
        tprops.base = base_exclusive
    }
    return tprops
}

function _arr2props (arr, info) {
    var items = arr.map(function (v,i) {
        return _any2typ(i, v, info)
    })
    return { base: 'arr', array: items }
}

// convert an object to a set of types by name using the given transform to interpret types.
// return the root object and types by name as an object:
// { root: root-object, byname: defined-types-by-name, unresolved: array-of-unresolved-references }
// Find all named types within the given type array or object (nested), collect them in an object and replace
// them with name string references.  return:
//
//      {
//          root:       the root object reference or object itself (if unnamed)
//          byname:     named objects by name
//      }
//
// While traversing, update all property names to the prop.name (from tiny or long forms) checking and removing the
// '$' prefix and collect custom properties (non-dollar) into 'fields' and 'pfields' objects, preparing for type creation.
// see tests for output examples.
//
function obj2typ (obj, opt) {
    opt = opt || {}
    opt.lookupfn = opt.lookupfn || tbase.lookup
    opt.createfn = opt.createfn || tbase.create
    var info = { path: [], byname: {},  unresolved: {} }
    var root = _any2typ(null, obj, opt, info )
    return { root: root, byname: info.byname, unresolved: info.unresolved }
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
            if (Object.keys(t.pfields).length && !t.is_generic()) {
                qbobj.map(t.pfields, null, function (k,v) { return typ2obj(v, typstr_transform, opt) }, {init: ret})
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
    obj2typ: obj2typ,
    typ2obj: function( v, typstr_transform, opt ) { return typ2obj(v, typstr_transform, assign({ tnf: 'name' }, opt)) }
}
