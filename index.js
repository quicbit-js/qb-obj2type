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
                    typeof name === 'string' || err('illegal type for ' + pathstr(path, vk) + ': ' + (typeof name))
                    !carry[name] || err('name used more than once: ' + name)
                    carry[name] = v.$n || v.$name || err('missing name prop: ' + pathstr(path))    // ensure name if tinyname or fullname are set
                }
            })
        }
        return carry
    }, {})
}

function transform_type(v, tcode, path, typ_transform) {
    var nv
    switch (tcode) {
        case TCODES.ARR:
            nv = { base: 'arr' }
            break
        case TCODES.OBJ:
            nv = { base: 'obj' }
            break
        case TCODES.STR:
            // string is a type name
            nv = typ_transform(v, path)
            break
        default:
            err('unexpected value type: ' + tcode)
    }
    return nv
}

function set_prop (prop_type, dst_obj, k, v) {
    switch (prop_type) {
        case 'obj_field':
            if (!dst_obj.fields) { dst_obj.fields = {} }
            dst_obj.fields[k] = v
            break
        case 'obj_expr':
            if (!dst_obj.expr) { dst_obj.expr = {} }
            dst_obj.expr[k] = v
            break
        case 'meta':
            dst_obj[k] = v
            break
        case 'arr_item':
            if (!dst_obj.items) { dst_obj.items = [] }
            dst_obj.items[k] = v
            break
        default:
            err('unknown prop_type')
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
//
function obj_by_name (obj, typ_transform) {
    // context is null, 'value', or 'fields' - influences interpretation of properties
    var info = { path: [], byname: {}, typ_transform: typ_transform }
    var root = process_any(null, obj, info, null)
    return { root: root, byname: info.byname }
}

// normalize property names.  e.g. $n -> name, $type -> type...
var DPROPS = dprops_map('$')

function process_any(k, v, info, dst) {
    v || err('missing value: ' + pathstr(info.path))
    var ret
    switch (typeof v) {
        case 'object':
            if (k !== null) { info.path.push(k) }
            if (Array.isArray(v)) {
                ret = process_arr(v, info, dst)
            } else {
                ret = process_obj(v, info, dst)
            }
            if (k !== null) { info.path.pop(k) }
            break
        case 'string':
            ret = process_ref(k, v, info, dst)
            break
        default:
            err('unexpected value: ' + pathstr(info.path, k, valtype(v)))
    }
    return ret
}

// process a reference string (type name)
function process_ref (k, v, info, dst) {
    return info.typ_transform(v) || err('unknown type: ' + pathstr(info.path, k, v))
}

// a type object that may represent any type using base, value and custom (non-$) properties.
function process_obj (obj, info, dst) {
    dst = dst || { base: null }        // collect normalized properties into this object, checking for collisions.  set base first because it's easier on the eyes when debugging

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
                dst.expr[k] = process_any(k, v, info, dst)
            } else {
                if (!dst.fields) { dst.fields = {} }
                dst.fields[k] = process_any(k, v, info, dst)
            }
        }
    })

    // Process $-Metadata and write values onto the 'ret' object - to be returned.
    // order is important - first write type and base props, then recurse value (which checks against base and
    // may add fields and expressions),
    if (special.typ) {
        info.typ_transform(special.typ) === 'typ' || err('expected type "type" but got: ' + special.typ)
    }
    if (special.base) {
        dst.base = info.typ_transform(special.base)
    }
    if (special.val) {
        var ndst = process_any ('$val', special.val, info, dst)
        var ntyp = typeof ndst
        if (ntyp === 'string' || ntyp === 'object' && Array.isArray(ntyp)) {
            Object.keys(dst).length === 1 && dst.base === null || errp('properties are not allowed with value ' + ndst, info.path, '$val')
        }
        dst = ndst
    } else {
        // replace named objects with their names
        if (dst.name) {
            info.byname[dst.name] = dst
            dst = dst.name
        }
    }

    dst.base = dst.base || 'obj'
    return dst
}

function process_arr (arr, info) {
    var items = arr.map(function (v,i) { return process_any(i, v, info)})
    return { base: 'arr', items: items }
}

// implementation notes:
//
// $values are written to parent. for example - this object:
//
//   { $t: 'type', $v: { $n: 'xtype', $d: 'an example type', $base: 'i' } }
//
// is traversed with this state:
//
//    path              v                   parents-at-entry
//    []                {$t:'type'...       []
//    ['$t']            'type'              [root]                  // type checked - not written
//    ['$v']            {$n:'xtype'...      [root]                  // add val-obj, *root*      marked as nested, assert root has no custom fields
//    ['$v','$n']       'xtype'             [root,val-obj]          // set name     *on root*   because parent is val-obj
//    ['$v','$d']       'an example...'     [root,val-obj]          // set desc     *on root*
//    ['$v','$b']       'i'                 [root,val-obj]          // set base     *on root* (override 'obj')
//
// $fields are written to parent and mixed custom fields are not allowed, for example:
//
//   { $t: 'type', $n: 'xtype', $fields: {a:'i'}, $stip: {a:'0..100'}, b:'s' }
//
// is traversed with this state:
//
//    path                  v                   parents-at-entry
//    []                    {$t:'type'...       []
//    ['$t']                'type'              [root]                      // type checked - not written
//    ['$n']                'xtype'             [root]                      // set name        *on root*
//    ['$fields']           {a:'i'}             [root]                      // add fields-obj  *root*       marked as nested, assert root has no custom fields
//    ['$fields','a']       'i'                 [root,fields-obj]           // set fields.a    *on root*    because parent is fields-obj
//    ['$stip']             {a:'0..100'}        [root]                      // set stip        *on root*
//    ['b']                 's'                 [root]                      // Error.                       because root is marked 'nested' (no mixed fields)
//
// $fields in a $value are written to parent-parent, and mixed fields are not allowed:
//
//   { $t: 'type', $v: { $n: 'xtype', $fields: {a:'i'} }, $stip: {a:'0..100'}, {b:'s'} }
//
// is traversed with this state:
//
//    path                   v                  parents-at-entry
//    []                     {$t:'type'...      []
//    ['$t']                 'type'             [root]                      // type checked - not written
//    ['$v']                 {$n:'xtype'...     [root]                      // add val-obj     *root*       marked as nested, assert root has no custom fields
//    ['$v','$n']            'xtype'            [root,val-obj]              // set name        *on root*
//    ['$v','$fields']       {a:'i'}            [root,val-obj]              // add fields-obj
//    ['$v','$fields','a']   'i'                [root,val-obj,fields-obj]   // set fields.a    *on root*    because parent is fields-obj and parent-parent is val-obj
//    ['$v','$stip']         {a:'0..100'}       [root]                      // set stip        *on root*
//    ['b']                  's'                [root]                      // Error.                       because root is marked 'nested'


function obj_by_name2(obj, typ_transform) {
    // normalize property names.  e.g. $n -> name, $type -> type...
    var dprops = dprops_map('$')
    var props = dprops_map('')
    var byname = {}                         // named types
    var FIELDS = 'FIELDS'
    var VALUE = 'VALUE'

    // parents (the carry) holds the stack of parent objects that match path as we traverse the graph.
    var parents = qbobj.walk(obj, function (parents, k, i, tcode, v, path, control) {
        var parent                      // parent container or marker (FIELDS, VALUES, or object)
        var dst_obj                     // object that we will write properties to (may be a level or two above '$fields' or '$value')
        if (path.length) {
            // keep parents length in synch with path as we traverse the graph
            if (parents.length > path.length) {
                parents.length = path.length
            }
            // figure dst_obj
            var pidx = parents.length - 1
            parent = dst_obj = parents[pidx]
            if (dst_obj === FIELDS) {
                dst_obj = parents[--pidx]
            }
            if (dst_obj === VALUE) {
                dst_obj = parents[--pidx]
            }
        }

        // figure prop_type and normal property name (nk)
        var prop_type      // root, arr_item, meta, obj_field, or obj_expr
        var nk
        if (path.length === 0) {
            prop_type = 'root'
            // nk is undefined
        } else if (k) {
            if (parent === FIELDS) {
                // custom property definition
                prop_type = has_char(k, '*', '^') ? 'obj_expr' : 'obj_field'
                nk = k
            } else if (parent === VALUE) {
                // value/type metadata
                prop_type = 'meta'
                nk = props[k] || err('unknown property for type: ' + k)
            } else if (k[0] === '$') {
                // value/type metadata
                prop_type = 'meta'
                nk = dprops[k] || err('unknown property: ' + k)   // remove '$'
            } else {
                // custom property definition
                prop_type = has_char(k, '*', '^') ? 'obj_expr' : 'obj_field'
                nk = k
            }
        } else {
            prop_type = 'arr_item'
            nk = i
        }

        // handle meta values
        var nv
        if (prop_type === 'meta') {
            if (nk === 'val') {
                dst_obj.nested_fields == null || err('property: ' + k + ' cannot be set under property: ' + obj.nested_fields)
                !dst_obj.fields && !dst_obj.expr || err('type cannot mix custom fields with value property: ' + k)
                dst_obj.nested_fields = 'value'
                parents.push(VALUE)
                nv = null                           // no value to set
            } else if (nk === 'fields') {
                !dst_obj.fields && !dst_obj.expr || err('type cannot mix custom fields with fields property: ' + k)
                dst_obj.nested_fields = 'fields'
                parents.push(FIELDS)
                nv = null                           // no value to set
            } else if (nk === 'typ') {
                v === 't' || v === 'typ' || v === 'type' || err('expected type to be "type", but got: ' + v)
                nv = null                           // no value to set
            } else {
                // meta value will be set on dst_obj...
                if (nk === 'base') {
                    nv = typ_transform(v) || err('unknown base type: ' + v)
                } else if (nk === 'stip') {
                    // keep value intact, for now
                    nv = v
                    control.walk = 'skip'
                } else {
                    nv = v  // is name, description...
                }
            }
        } else {
            // non-meta property (root, obj_field, obj_expr, or arr_item)
            nv = transform_type(v, tcode, path, typ_transform)

            if (typeof nv === 'object') {
                parents.push(nv)
                if (tcode === TCODES.OBJ) {
                    var obj_name =
                        (parent === VALUE && (v.n || v.name)) ||
                        (parent !== VALUE && (v.$n || v.$name)) || null
                    if (!obj_name) {
                        var obj_val = v.$v || v.$val || v.$value || null
                        if (obj_val) {
                            obj_name = obj_val.n || obj_val.name || null
                        }
                    }

                    // register named types, and replace object with name
                    if (obj_name) {
                        byname[obj_name] = nv
                        nv = obj_name
                    }
                }
            }
        }

        if (nv && prop_type !== 'root') {
            set_prop(prop_type, dst_obj, nk, nv)
        }

        return parents
    }, [])
    return { root: parents[0].name || parents[0], byname: byname }
}

// convert an object to a set of types by name using the given tset to interpret types.  return the root object and types by name as an object:
// { root: ..., byname: types-by-name }
function obj2typ (o, typ_transform) {
    o && typeof o === 'object' || err('expected an object but got: ' + (Object.prototype.toString.call(o)))
    // other types are in user-object form
    var names_map = collect_names(o)        // todo: pass base types - do not allow override
    var typ_trans = function (n, path) {
        // allow new names to override established names (typ_transform)
        return names_map[n] || typ_transform(n) || err('unknown type: ' + pathstr(path, n)) // todo: check with base types
    }

    var ret = obj_by_name(o, typ_trans)        // reduce/simplify nested structure

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
