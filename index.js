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

function pathstr (path, n) {
    var sep = (path.length && n != null) ? '/' : ''
    return path.join('/') + sep + (n || '')
}

// return a map of all names within the object ($tinyname, $fullname, $name) mapped to the name.
function collect_names(obj) {
    return qbobj.walk(obj, function (carry, k, i, tcode, v, path) {
        if (tcode === TCODES.OBJ) {
            Object.keys(v).forEach(function (vk) {
                if (NAME_PROPS[vk]) {
                    var name = v[vk]
                    typeof name === 'string' || err('illegal type for ' + pathstr(path, vk) + ': ' + (typeof name))
                    !carry[name] || err('name used more than once: ' + name)
                    carry[name] = v.$n || v.$name || err('missing name prop: ' + pathstr(path))    // ensure name if tinyname or fullname are set
                }
            })
        }
        return carry
    }, {})
}

function transform_type(v, tcode, path, pstate, byname, typ_transform) {
    var nv
    switch (tcode) {
        case TCODES.ARR:
            nv = { base: 'arr' }
            pstate.push(nv)
            break
        case TCODES.OBJ:
            nv = { base: 'obj' }
            pstate.push(nv)
            var obj_name = v.$n || v.$name
            if (obj_name) {
                // replace named value with a reference
                byname[obj_name] = nv
                nv = obj_name
            }
            break
        case TCODES.STR:
            // string is a type name
            nv = typ_transform(v, path)
            break
    }
    return nv
}

function link_parent (prop_type, parent, k, v) {
    switch (prop_type) {
        case 'obj_field':
            if (!parent.fields) { parent.fields = {} }
            parent.fields[k] = v
            break
        case 'obj_expr':
            if (!parent.expr) { parent.expr = {} }
            parent.expr[k] = v
            break
        case 'obj_prop':
            parent[k] = v
            break
        case 'arr_item':
            if (!parent.items) { parent.items = [] }
            parent.items[k] = v
            break
    }
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
    var dprops = dprops_map('$')
    var props = dprops_map('')
    var byname = {}                         // named types
    var pstate = qbobj.walk(obj, function (carry, k, i, tcode, v, path, control) {
        // carry holds the parent objects as we traverse the graph.  the little snippet below keeps the carry objects
        // in sync with the path traversal:
        //
        // for example - traversing:
        //    { 'prop-a': [ 'v1', 'v2' ], 'prop-b': 'v3' }
        //
        // yields:
        //
        //    path              carry
        //    []                []                       +  root-obj
        //    ['prop-a']        [root-obj]               +  array-obj
        //    ['prop-a', 0]     [root-object, array-obj] +  nothing (v1 is terminal)
        //    ['prop-a', 1]     [root-object, array-obj] +  nothing (v2 is terminal)
        //    ['prop-b']        [root-object]            +  nothing (v3 is terminal)
        //
        // notice when prop-b was traversed, carry was shortened to match the path length.  also notice that the root object
        // is never removed since zero-length path only happens at the start.
        //
        if (carry.length > path.length) {
            carry.length = path.length
        }
        var parent = carry[carry.length-1]
        var prop_type      // root, arr_item, obj_prop, obj_field, or obj_expr
        var nk = null
        if (k) {
            if (k[0] === '$') {
                // dollar-prop at object level
                prop_type = 'obj_prop'
                nk = dprops[k] || err('unknown property: ' + k)   // remove '$'
            } else {
                // field prop at object level
                prop_type = has_char(k, '*', '^') ? 'obj_expr' : 'obj_field'
                nk = k
            }
        } else if (path.length === 0) {
            prop_type = 'root'
            nk = null
        } else {
            prop_type = 'arr_item'
            nk = i
        }

        // process arrays, plain record fields, and $base and $type values
        var nv = v                              // default v for any missing case, including 'skip'
        if (
            prop_type === 'root' || prop_type === 'obj_field' || prop_type === 'obj_expr' || prop_type === 'arr_item' ||
            prop_type === 'obj_prop' && (nk === 'type' || nk === 'base' || nk === 'val')
        ) {
            nv = transform_type(v, tcode, path, carry, byname, typ_transform)
        } else {
            control.walk = 'skip'
        }

        if (prop_type !== 'root') {
            link_parent(prop_type, parent, nk, nv)
        }
        return carry
        // return pstate[0]
        // console.log('   -> npath: /' + npath.join('/') || 'root', ':', pstate.length)
    }, [])
    return { root: pstate[0].name || pstate[0], byname: byname }
}

// convert an object to a set of types by name using the given tset to interpret types.  return the root object and types by name as an object:
// { root: ..., byname: types-by-name }
function obj2typ (o, typ_transform) {
    o && typeof o === 'object' || err('expected an object but got: ' + (Object.prototype.toString.call(o)))
    // other types are in user-object form
    var names_map = collect_names(o)
    var trans = function (n, path) {
        return names_map[n] || typ_transform(n) || err('unknown type: ' + pathstr(path, n))
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
            var items = t.is_generic() ? [] : t.items.map(function (item) { return typ2obj(item, typ_transform, opt) })

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
        case BASE_CODES.obj:
            ret = {}
            if (t.name !== t.base) {
                copy_type_props(t, ret, opt)
            }
            qbobj.map(t.fields, null, function (k,v) { return typ2obj(v, typ_transform, opt) }, {init: ret})
            if (Object.keys(t.expr).length && !t.is_generic()) {
                qbobj.map(t.expr, null, function (k,v) { return typ2obj(v, typ_transform, opt) }, {init: ret})
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
