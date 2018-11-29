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

var tbase = require('qb1-type-base')
var qbobj = require('qb-obj')

var TYPES_BY_NAME = tbase.types_by_all_names()
var PROPS_BY_NAME = tbase.props_by_all_names()

// return a map of ($-prefixed) prop names to prop.name
// $s -> stip,          $stip -> stip,         $stipulations -> stip, ...
function dprops_map (key_prefix) {
    return qbobj.map(
        PROPS_BY_NAME,
        function (name) { return key_prefix + name },
        function (name, prop) { return prop.name }
    )
}
// map to normalize property names.  e.g. $n -> name, $type -> type...
var DPROPS = dprops_map('$')

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
                    ret = opt.lookupfn('arr')
                } else {
                    props = _arr2props(v, opt, info)
                }
            } else {
                if (Object.keys(v).length === 0) {
                    // generic object
                    ret = opt.lookupfn('obj')
                } else {
                    props = _normalize_props(v, opt, info)
                    if (props.type || props.value) {
                        // set return - we are done
                        ret = _typval2typ(props, opt, info)
                    } else {
                        // only now can we default the base to 'obj' (base value was checked if set in _normalize_props, above)
                        var base = TYPES_BY_NAME[props.base || 'obj']
                        props.base = base.name
                        if (props.base === 'mul' && props.mul.length === 1) {
                            // convert single multi-type to single type
                            ret = _any2typ(k, props.mul[0], opt, info)
                        } else {
                            props = _process_child_types (props, opt, info)
                        }
                        check_base_props(props, TYPES_BY_NAME[props.base], info)
                    }
                }
            }
            if (!ret) {
                ret = opt.createfn(props, opt)
                if (ret.name) {
                    info.defined_types[ret.name] = ret
                }
            }
            if (k !== null) { info.path.pop() }
            break

        case 'string':
            ret = opt.lookupfn(v)
            if (ret) {
                ret.name !== 'mul' || err('multi type "' + v + '" is not a stand-alone type')
            } else {
                info.unresolved[v] = 1
                ret = v                     // leave as string for a second pass where we have all the types defined
            }
            break

        default:
            errp('unexpected value', info.path, k, valtype(v))
    }
    return ret
}

function check_base_props (tprops, base, info) {
    ['name', 'fullname', 'tinyname'].forEach(function (nameprop) {
        var name = tprops[nameprop]
        if (name) {
            !TYPES_BY_NAME[name] || errp("name '" + name + "' is a base type name, it cannot be used for " + nameprop, info.path, nameprop )
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
function _process_child_types (tprops, opt, info) {
    switch (tprops.base) {
        case 'arr':
            tprops.arr =
                tprops.arr && tprops.arr.map(function (v, i) { return _any2typ(i, v, opt, info) })
                || [opt.lookupfn('*')]
            break
        case 'obj':
            tprops.obj =
                tprops.obj && qbobj.map(tprops.obj, null, function (k, v) { return _any2typ(k, v, opt, info)} )
                || { '*': opt.lookupfn('*') }
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
function _normalize_props (obj, opt, info) {
    var tprops = {}                 // type properties - can be passed to tbase.create() to create type objects
    var obj_fields = {}             // non-$ fields (are intepreted as object fields)
    var base_exclusive = null

    Object.keys(obj).forEach(function (k) {
        var v = obj[k]
        if (k[0] === '$') {
            var nk = DPROPS[k] || opt.custom_props && opt.custom_props[k] || errp('unknown property', info.path, k)
            tprops[nk] = v
            // properties that set base - only one allowed
            if ({mul:1, arr:1}[nk]) {
                base_exclusive == null || errp(nk + ' cannot be set together with ' + base_exclusive, info.path)
                base_exclusive = nk
            }
        } else {
            obj_fields[k] = v
        }
    })

    if (Object.keys(obj_fields).length) {
        // note that 'obj' has similar meaning to 'arr' or 'mul', but it is not part of
        // the public object protocol (doesn't have public Property and is only set by creating non-$ fields.)
        tprops.obj = obj_fields
    }

    if (tprops.base) {
        // normalize base (before comparing with base_exclusive)
        var base = TYPES_BY_NAME[tprops.base] || errp('unknown base type: ' + tprops.base, info.path)
        tprops.base = base.name
    }

    if (base_exclusive) {
        // fields like $arr and $mul set the base to their value, but only one is allowed
        tprops.base == null || tprops.base === base_exclusive || errp('mismatched base.  expected ' + base_exclusive + ' but got: ' + tprops.base, info.path)
        Object.keys(obj_fields).length === 0 || err('custom (non-$) fields are only supported for objects, not ' + base_exclusive, info.path)
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
// { root: root-object, defined_types: defined-types-by-name, unresolved: array-of-unresolved-references }
// Finds all named types within the given type array or object (nested)
//
// handles tinyname, name and fullname properties and types.  takes care of object $-props as well as $type/$value form.
//
// opt
//      fresh_copy      true by default.  create a fresh copy to decorate your tree with more information.
//                      if false, the tree will re-use IMMUTABLE nodes for common base types (str, int, nul, any, [*], {*:*}).
//
//      link_children   true by default.  linking children adds a parent link and parent_ctx (key or index) information
//                      to each child which allows path() to work on any child node.  fresh_copy cannot be set to false when using link_children.
//                      JSON.stringify will fail on trees with link_children because of the cycles.
//
//      createfn        plug in your own create-node function with same signature as qb1-type-base create (props, opt)
//
//      lookupfn        plug in your own type lookup function with same signature as qb1-type-base lookup (name, opt)
//
function obj2type (obj, opt) {
    opt = opt || {}
    var copy = opt.fresh_copy == null || opt.fresh_copy
    var link = opt.link_children == null ? copy : opt.link_children         // turn of linking if fresh_copy is false
    copy || !link || err('cannot link_children in type tree if fresh_copy is false')
    opt.createfn = opt.createfn || function (p) {
        return tbase.create(p, {link_children: link, custom_props: opt.custom_props, allow_unresolved: true })
    }
    opt.lookupfn = opt.lookupfn || function (n) { return tbase.lookup(n, ( copy ? {create_opt: {link_children: link}} : null )) }
    var info = { path: [], defined_types: {},  unresolved: {} }
    var root = _any2typ(null, obj, opt, info )
    return { root: root, defined_types: info.defined_types, unresolved: info.unresolved }
}

function err (msg) { throw Error(msg) }

module.exports = obj2type
