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
var assign = require('qb-assign')
var qbobj = require('qb1-obj')

var BASE_TYPES_BY_NAME = tbase.types().reduce(function (m,t) { m[t.name] = m[t.tinyname] = m[t.fullname] = t; return m }, {})
var PROPS_BY_NAME = tbase.props().reduce(function (m,p) { m[p.name] = m[p.tinyname] = m[p.fullname] = p; return m }, {})

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

// return a map of ($-prefixed) prop names to prop.name
// $s -> stip,          $stip -> stip,         $stipulations -> stip, ...
function dprops_map (key_prefix) {
    return qbobj.map(
        PROPS_BY_NAME,
        function (name) { return key_prefix + name },
        function (name, prop) { return prop.name }
    )
}

function valtype (v) {
    return v + ' ' + Object.prototype.toString.call(v)
}

function pathstr (path, n, v) {
    if (n != null) {
        path = path.concat(n)
    }
    return path.join('/') + (v ? (': ' + v) : '')
}

function errp (msg, path, n, v) {
    err(msg + ' at ' + pathstr(path, n, v))
}

function _typval2typ (props, opt, info) {
    // check and handle $type/$value form
    props.type || errp( 'missing $type property for $type/$value', info.path)
    props.value || errp('missing $value property for $type/$value', info.path)
    Object.keys(props).length === 2 || errp('$type/value form does not allow other type properties', info.path)
    props.type === 'type' || props.type === 'typ' || props.type === 't' || errp('expected type "type" but got ' + props.type, info.path)
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
                if (v.length === 0) {
                    // generic array
                    ret = BASE_TYPES_BY_NAME.arr
                } else {
                    props = _arr2props(v, opt, info)
                }
            } else {
                if (Object.keys(v).length === 0) {
                    // generic object
                    ret = BASE_TYPES_BY_NAME.obj
                } else {
                    props = _normalize_props(v, info)
                    if (props.type || props.value) {
                        // set return - we are done
                        ret = _typval2typ(props, opt, info)
                    } else {
                        // only now can we default the base to 'obj' (base value was checked if set in _normalize_props, above)
                        var base = BASE_TYPES_BY_NAME[props.base || 'obj']
                        props.base = base.name
                        props = _process_specific_props (props, opt, info)
                        props = inherit_base(props, BASE_TYPES_BY_NAME[props.base], info)
                    }
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
        if (name) {
            !BASE_TYPES_BY_NAME[name] || errp("name '" + name + "' is a base type name, it cannot be used for " + nameprop, info.path, nameprop )
        }
    })
    // need this check when we have stipulations
    // if (base.stip) {
    //     !tprops.stip || err('stipulation merging not implemented')
    //     tprops.stip = base.stip
    // }
    return tprops
}

// convert the type-specific expressions into types ($arr, $mul, custom fields...)
function _process_specific_props (tprops, opt, info) {
    switch (tprops.base) {
        case 'arr':
            tprops.arr = tprops.arr && tprops.arr.map(function (v, i) { return _any2typ(i, v, opt, info) })
                || [BASE_TYPES_BY_NAME.any]
            break
        case 'obj':
            var num_fields = 0
            if (tprops.fields) {
                num_fields += Object.keys(tprops.fields).length
                tprops.fields = qbobj.map(tprops.fields, null, function (k, v) { return _any2typ(k, v, opt, info)} )
            }
            if (tprops.pfields) {
                num_fields += Object.keys(tprops.pfields).length
                tprops.pfields = qbobj.map(tprops.pfields, null, function (k, v) { return _any2typ(k, v, opt, info)} )
            }
            if (tprops.match_all) {
                num_fields++
                tprops.match_all = _any2typ('*', tprops.match_all, opt, info)
            }
            if (num_fields === 0) {
                // default empty objects to generic object behavior - so {} and {*:*} are equivalent, but {*:*} is a created type while {} is generic object.
                tprops.match_all = BASE_TYPES_BY_NAME.any
            }
            break
        case 'mul':
            info.path.push('$mul')
            tprops.mul = tprops.mul.map(function (v,i) { return _any2typ(i, v, opt, info) })
            info.path.pop()
            break
        // other base types don't have extra props
    }
    return tprops
}

// collect, check, and standardize property names.  note that no new properties are added when given
// a simple $type/$value object (properties are only added if custom fields or $arr, $mul... are set).
function _normalize_props (obj, info) {
    var tprops = {}                 // type properties - can be passed to tbase.create() to create type objects
    var fields = {}                 // custom-fields
    var pfields = {}                // custom pattern fields (with '*abc...')
    var match_all = null            // set to type if the object contains the '*' match-all expression
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
            if (k === '*') {
                match_all = v
            } else if (has_char(k, '*', '^')) {
                pfields[k] = v
            } else {
                fields[k] = v
            }
        }
    })

    if (Object.keys(fields).length) { tprops.fields = fields }
    if (Object.keys(pfields).length) { tprops.pfields = pfields }
    if (match_all) { tprops.match_all = match_all }

    if (tprops.base) {
        // normalize base (before comparing with base_exclusive)
        var base = BASE_TYPES_BY_NAME[tprops.base] || errp('unknown base type: ' + tprops.base, info.path)
        tprops.base = base.name
    }

    if (base_exclusive) {
        // fields like $arr and $mul set the base to their value, but only one is allowed
        tprops.base == null || tprops.base === base_exclusive || errp('mismatched base.  expected ' + base_exclusive + ' but got: ' + tprops.base, info.path)
        !has_custom || err('custom (non-$) fields are only supported for objects, not ' + base_exclusive, info.path)
        tprops.base = base_exclusive
    }
    return tprops
}

function _arr2props (arr, opt, info) {
    var items = arr.map(function (v,i) {
        return _any2typ(i, v, opt, info)
    })
    return { base: 'arr', arr: items }
}

// convert an plain object type representation to a graph of type objects and name resolution info.
// return the root object and types by name as an object:
// { root: root-object, byname: defined-types-by-name, unresolved: array-of-unresolved-references }
// Finds all named types within the given type array or object (nested)
//
// handles tinyname, name and fullname properties and types.  takes care of object $-props as well as $type/$value form.
function obj2typ (obj, opt) {
    opt = opt || {}
    opt.lookupfn = opt.lookupfn || (opt.reuse_types ? tbase.lookup : tbase.create_base)
    opt.createfn = opt.createfn || tbase.create
    var info = { path: [], byname: {},  unresolved: {} }
    var root = _any2typ(null, obj, opt, info )
    return { root: root, byname: info.byname, unresolved: info.unresolved }
}

function err (msg) { throw Error(msg) }

module.exports = {
    _has_char: has_char,
    obj2typ: obj2typ,
}
