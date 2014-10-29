/* begin: ../libs/bem-core/common.blocks/i-bem/i-bem.vanilla.js */
/**
 * @module i-bem
 */

modules.define(
    'i-bem',
    [
        'i-bem__internal',
        'inherit',
        'identify',
        'next-tick',
        'objects',
        'functions',
        'events'
    ],
    function(
        provide,
        INTERNAL,
        inherit,
        identify,
        nextTick,
        objects,
        functions,
        events) {

var undef,

    MOD_DELIM = INTERNAL.MOD_DELIM,
    ELEM_DELIM = INTERNAL.ELEM_DELIM,

    /**
     * Storage for block init functions
     * @private
     * @type Array
     */
    initFns = [],

    /**
     * Storage for block declarations (hash by block name)
     * @private
     * @type Object
     */
    blocks = {};

/**
 * Builds the name of the handler method for setting a modifier
 * @param {String} prefix
 * @param {String} modName Modifier name
 * @param {String} modVal Modifier value
 * @param {String} [elemName] Element name
 * @returns {String}
 */
function buildModFnName(prefix, modName, modVal, elemName) {
    return '__' + prefix +
        (elemName? '__elem_' + elemName : '') +
       '__mod' +
       (modName? '_' + modName : '') +
       (modVal? '_' + modVal : '');
}

/**
 * Transforms a hash of modifier handlers to methods
 * @param {String} prefix
 * @param {Object} modFns
 * @param {Object} props
 * @param {String} [elemName]
 */
function modFnsToProps(prefix, modFns, props, elemName) {
    if(functions.isFunction(modFns)) {
        props[buildModFnName(prefix, '*', '*', elemName)] = modFns;
    } else {
        var modName, modVal, modFn;
        for(modName in modFns) {
            if(modFns.hasOwnProperty(modName)) {
                modFn = modFns[modName];
                if(functions.isFunction(modFn)) {
                    props[buildModFnName(prefix, modName, '*', elemName)] = modFn;
                } else {
                    for(modVal in modFn) {
                        if(modFn.hasOwnProperty(modVal)) {
                            props[buildModFnName(prefix, modName, modVal, elemName)] = modFn[modVal];
                        }
                    }
                }
            }
        }
    }
}

function buildCheckMod(modName, modVal) {
    return modVal?
        Array.isArray(modVal)?
            function(block) {
                var i = 0, len = modVal.length;
                while(i < len)
                    if(block.hasMod(modName, modVal[i++]))
                        return true;
                return false;
            } :
            function(block) {
                return block.hasMod(modName, modVal);
            } :
        function(block) {
            return block.hasMod(modName);
        };
}

function convertModHandlersToMethods(props) {
    if(props.beforeSetMod) {
        modFnsToProps('before', props.beforeSetMod, props);
        delete props.beforeSetMod;
    }

    if(props.onSetMod) {
        modFnsToProps('after', props.onSetMod, props);
        delete props.onSetMod;
    }

    var elemName;
    if(props.beforeElemSetMod) {
        for(elemName in props.beforeElemSetMod) {
            if(props.beforeElemSetMod.hasOwnProperty(elemName)) {
                modFnsToProps('before', props.beforeElemSetMod[elemName], props, elemName);
            }
        }
        delete props.beforeElemSetMod;
    }

    if(props.onElemSetMod) {
        for(elemName in props.onElemSetMod) {
            if(props.onElemSetMod.hasOwnProperty(elemName)) {
                modFnsToProps('after', props.onElemSetMod[elemName], props, elemName);
            }
        }
        delete props.onElemSetMod;
    }
}

/**
 * @class BEM
 * @description Base block for creating BEM blocks
 * @augments events:Emitter
 * @exports
 */
var BEM = inherit(events.Emitter, /** @lends BEM.prototype */ {
    /**
     * @constructor
     * @private
     * @param {Object} mods Block modifiers
     * @param {Object} params Block parameters
     * @param {Boolean} [initImmediately=true]
     */
    __constructor : function(mods, params, initImmediately) {
        /**
         * Cache of block modifiers
         * @member {Object}
         * @private
         */
        this._modCache = mods || {};

        /**
         * Current modifiers in the stack
         * @member {Object}
         * @private
         */
        this._processingMods = {};

        /**
         * Block parameters, taking into account the defaults
         * @member {Object}
         * @readonly
         */
        this.params = objects.extend(this.getDefaultParams(), params);

        initImmediately !== false?
            this._init() :
            initFns.push(this._init, this);
    },

    /**
     * Initializes the block
     * @private
     */
    _init : function() {
        return this.setMod('js', 'inited');
    },

    /**
     * Adds an event handler
     * @param {String|Object} e Event type
     * @param {Object} [data] Additional data that the handler gets as e.data
     * @param {Function} fn Handler
     * @param {Object} [ctx] Handler context
     * @returns {BEM} this
     */
    on : function(e, data, fn, ctx) {
        if(typeof e === 'object' && (functions.isFunction(data) || functions.isFunction(fn))) { // mod change event
            e = this.__self._buildModEventName(e);
        }

        return this.__base.apply(this, arguments);
    },

    /**
     * Removes event handler or handlers
     * @param {String|Object} [e] Event type
     * @param {Function} [fn] Handler
     * @param {Object} [ctx] Handler context
     * @returns {BEM} this
     */
    un : function(e, fn, ctx) {
        if(typeof e === 'object' && functions.isFunction(fn)) { // mod change event
            e = this.__self._buildModEventName(e);
        }

        return this.__base.apply(this, arguments);
    },

    /**
     * Executes the block's event handlers and live event handlers
     * @protected
     * @param {String} e Event name
     * @param {Object} [data] Additional information
     * @returns {BEM} this
     */
    emit : function(e, data) {
        var isModJsEvent = false;
        if(typeof e === 'object' && !(e instanceof events.Event)) {
            isModJsEvent = e.modName === 'js';
            e = this.__self._buildModEventName(e);
        }

        if(isModJsEvent || this.hasMod('js', 'inited')) {
            this.__base(e = this._buildEvent(e), data);
            this._ctxEmit(e, data);
        }

        return this;
    },

    _ctxEmit : function(e, data) {
        this.__self.emit(e, data);
    },

    /**
     * Builds event
     * @private
     * @param {String|events:Event} e
     * @returns {events:Event}
     */
    _buildEvent : function(e) {
        typeof e === 'string'?
            e = new events.Event(e, this) :
            e.target || (e.target = this);

        return e;
    },

    /**
     * Checks whether a block or nested element has a modifier
     * @param {Object} [elem] Nested element
     * @param {String} modName Modifier name
     * @param {String} [modVal] Modifier value
     * @returns {Boolean}
     */
    hasMod : function(elem, modName, modVal) {
        var len = arguments.length,
            invert = false;

        if(len === 1) {
            modVal = '';
            modName = elem;
            elem = undef;
            invert = true;
        } else if(len === 2) {
            if(typeof elem === 'string') {
                modVal = modName;
                modName = elem;
                elem = undef;
            } else {
                modVal = '';
                invert = true;
            }
        }

        var res = this.getMod(elem, modName) === modVal;
        return invert? !res : res;
    },

    /**
     * Returns the value of the modifier of the block/nested element
     * @param {Object} [elem] Nested element
     * @param {String} modName Modifier name
     * @returns {String} Modifier value
     */
    getMod : function(elem, modName) {
        var type = typeof elem;
        if(type === 'string' || type === 'undefined') { // elem either omitted or undefined
            modName = elem || modName;
            var modCache = this._modCache;
            return modName in modCache?
                modCache[modName] || '' :
                modCache[modName] = this._extractModVal(modName);
        }

        return this._getElemMod(modName, elem);
    },

    /**
     * Returns the value of the modifier of the nested element
     * @private
     * @param {String} modName Modifier name
     * @param {Object} elem Nested element
     * @param {Object} [elemName] Nested element name
     * @returns {String} Modifier value
     */
    _getElemMod : function(modName, elem, elemName) {
        return this._extractModVal(modName, elem, elemName);
    },

    /**
     * Returns values of modifiers of the block/nested element
     * @param {Object} [elem] Nested element
     * @param {String} [...modNames] Modifier names
     * @returns {Object} Hash of modifier values
     */
    getMods : function(elem) {
        var hasElem = elem && typeof elem !== 'string',
            modNames = [].slice.call(arguments, hasElem? 1 : 0),
            res = this._extractMods(modNames, hasElem? elem : undef);

        if(!hasElem) { // caching
            modNames.length?
                modNames.forEach(function(name) {
                    this._modCache[name] = res[name];
                }, this) :
                this._modCache = res;
        }

        return res;
    },

    /**
     * Sets the modifier for a block/nested element
     * @param {Object} [elem] Nested element
     * @param {String} modName Modifier name
     * @param {String} modVal Modifier value
     * @returns {BEM} this
     */
    setMod : function(elem, modName, modVal) {
        if(typeof modVal === 'undefined') {
            if(typeof elem === 'string') { // if no elem
                modVal = typeof modName === 'undefined'?
                    true :  // e.g. setMod('focused')
                    modName; // e.g. setMod('js', 'inited')
                modName = elem;
                elem = undef;
            } else { // if elem
                modVal = true; // e.g. setMod(elem, 'focused')
            }
        }

        if(!elem || elem[0]) {
            modVal === false && (modVal = '');

            var modId = (elem && elem[0]? identify(elem[0]) : '') + '_' + modName;

            if(this._processingMods[modId])
                return this;

            var elemName,
                curModVal = elem?
                    this._getElemMod(modName, elem, elemName = this.__self._extractElemNameFrom(elem)) :
                    this.getMod(modName);

            if(curModVal === modVal)
                return this;

            this._processingMods[modId] = true;

            var needSetMod = true,
                modFnParams = [modName, modVal, curModVal];

            elem && modFnParams.unshift(elem);

            var modVars = [['*', '*'], [modName, '*'], [modName, modVal]],
                prefixes = ['before', 'after'],
                i = 0, prefix, j, modVar;

            while(prefix = prefixes[i++]) {
                j = 0;
                while(modVar = modVars[j++]) {
                    if(this._callModFn(prefix, elemName, modVar[0], modVar[1], modFnParams) === false) {
                        needSetMod = false;
                        break;
                    }
                }

                if(!needSetMod) break;

                if(prefix === 'before') {
                    elem || (this._modCache[modName] = modVal); // cache only block mods
                    this._onSetMod(modName, modVal, curModVal, elem, elemName);
                }
            }

            this._processingMods[modId] = null;
            needSetMod && this._emitModChangeEvents(modName, modVal, curModVal, elem, elemName);
        }

        return this;
    },

    /**
     * Function after successfully changing the modifier of the block/nested element
     * @protected
     * @param {String} modName Modifier name
     * @param {String} modVal Modifier value
     * @param {String} oldModVal Old modifier value
     * @param {Object} [elem] Nested element
     * @param {String} [elemName] Element name
     */
    _onSetMod : function(modName, modVal, oldModVal, elem, elemName) {},

    _emitModChangeEvents : function(modName, modVal, oldModVal, elem, elemName) {
        var eventData = { modName : modName, modVal : modVal, oldModVal : oldModVal };
        elem && (eventData.elem = elem);
        this
            .emit({ modName : modName, modVal : '*', elem : elemName }, eventData)
            .emit({ modName : modName, modVal : modVal, elem : elemName }, eventData);
    },

    /**
     * Sets a modifier for a block/nested element, depending on conditions.
     * If the condition parameter is passed: when true, modVal1 is set; when false, modVal2 is set.
     * If the condition parameter is not passed: modVal1 is set if modVal2 was set, or vice versa.
     * @param {Object} [elem] Nested element
     * @param {String} modName Modifier name
     * @param {String} modVal1 First modifier value
     * @param {String} [modVal2] Second modifier value
     * @param {Boolean} [condition] Condition
     * @returns {BEM} this
     */
    toggleMod : function(elem, modName, modVal1, modVal2, condition) {
        if(typeof elem === 'string') { // if this is a block
            condition = modVal2;
            modVal2 = modVal1;
            modVal1 = modName;
            modName = elem;
            elem = undef;
        }

        if(typeof modVal1 === 'undefined') { // boolean mod
            modVal1 = true;
        }

        if(typeof modVal2 === 'undefined') {
            modVal2 = '';
        } else if(typeof modVal2 === 'boolean') {
            condition = modVal2;
            modVal2 = '';
        }

        var modVal = this.getMod(elem, modName);
        (modVal === modVal1 || modVal === modVal2) &&
            this.setMod(
                elem,
                modName,
                typeof condition === 'boolean'?
                    (condition? modVal1 : modVal2) :
                    this.hasMod(elem, modName, modVal1)? modVal2 : modVal1);

        return this;
    },

    /**
     * Removes a modifier from a block/nested element
     * @protected
     * @param {Object} [elem] Nested element
     * @param {String} modName Modifier name
     * @returns {BEM} this
     */
    delMod : function(elem, modName) {
        if(!modName) {
            modName = elem;
            elem = undef;
        }

        return this.setMod(elem, modName, '');
    },

    /**
     * Executes handlers for setting modifiers
     * @private
     * @param {String} prefix
     * @param {String} elemName Element name
     * @param {String} modName Modifier name
     * @param {String} modVal Modifier value
     * @param {Array} modFnParams Handler parameters
     */
    _callModFn : function(prefix, elemName, modName, modVal, modFnParams) {
        var modFnName = buildModFnName(prefix, modName, modVal, elemName);
        return this[modFnName]?
           this[modFnName].apply(this, modFnParams) :
           undef;
    },

    /**
     * Retrieves the value of the modifier
     * @private
     * @param {String} modName Modifier name
     * @param {Object} [elem] Element
     * @returns {String} Modifier value
     */
    _extractModVal : function(modName, elem) {
        return '';
    },

    /**
     * Retrieves name/value for a list of modifiers
     * @private
     * @param {Array} modNames Names of modifiers
     * @param {Object} [elem] Element
     * @returns {Object} Hash of modifier values by name
     */
    _extractMods : function(modNames, elem) {
        return {};
    },

    /**
     * Returns a block's default parameters
     * @protected
     * @returns {Object}
     */
    getDefaultParams : function() {
        return {};
    },

    /**
     * Deletes a block
     * @private
     */
    _destruct : function() {
        this.delMod('js');
    },

    /**
     * Executes given callback on next turn eventloop in block's context
     * @protected
     * @param {Function} fn callback
     * @returns {BEM} this
     */
    nextTick : function(fn) {
        var _this = this;
        nextTick(function() {
            _this.hasMod('js', 'inited') && fn.call(_this);
        });
        return this;
    }
}, /** @lends BEM */{

    _name : 'i-bem',

    /**
     * Storage for block declarations (hash by block name)
     * @type Object
     */
    blocks : blocks,

    /**
     * Declares blocks and creates a block class
     * @param {String|Object} decl Block name (simple syntax) or description
     * @param {String} decl.block|decl.name Block name
     * @param {String} [decl.baseBlock] Name of the parent block
     * @param {Array} [decl.baseMix] Mixed block names
     * @param {String} [decl.modName] Modifier name
     * @param {String|Array} [decl.modVal] Modifier value
     * @param {Object} [props] Methods
     * @param {Object} [staticProps] Static methods
     * @returns {Function}
     */
    decl : function(decl, props, staticProps) {
        // string as block
        typeof decl === 'string' && (decl = { block : decl });
        // inherit from itself
        if(arguments.length <= 2 &&
                typeof decl === 'object' &&
                (!decl || (typeof decl.block !== 'string' && typeof decl.modName !== 'string'))) {
            staticProps = props;
            props = decl;
            decl = {};
        }
        typeof decl.block === 'undefined' && (decl.block = this.getName());

        var baseBlock;
        if(typeof decl.baseBlock === 'undefined') {
            baseBlock = blocks[decl.block] || this;
        } else if(typeof decl.baseBlock === 'string') {
            baseBlock = blocks[decl.baseBlock];
            if(!baseBlock)
                throw('baseBlock "' + decl.baseBlock + '" for "' + decl.block + '" is undefined');
        } else {
            baseBlock = decl.baseBlock;
        }

        convertModHandlersToMethods(props || (props = {}));

        if(decl.modName) {
            var checkMod = buildCheckMod(decl.modName, decl.modVal);
            objects.each(props, function(prop, name) {
                functions.isFunction(prop) &&
                    (props[name] = function() {
                        var method;
                        if(checkMod(this)) {
                            method = prop;
                        } else {
                            var baseMethod = baseBlock.prototype[name];
                            baseMethod && baseMethod !== prop &&
                                (method = this.__base);
                        }
                        return method?
                            method.apply(this, arguments) :
                            undef;
                    });
            });
        }

        if(staticProps && typeof staticProps.live === 'boolean') {
            var live = staticProps.live;
            staticProps.live = function() {
                return live;
            };
        }

        var block, baseBlocks = baseBlock;
        if(decl.baseMix) {
            baseBlocks = [baseBlocks];
            decl.baseMix.forEach(function(mixedBlock) {
                if(!blocks[mixedBlock]) {
                    throw('mix block "' + mixedBlock + '" for "' + decl.block + '" is undefined');
                }
                baseBlocks.push(blocks[mixedBlock]);
            });
        }

        if(decl.block === baseBlock.getName()) {
            // makes a new "live" if the old one was already executed
            (block = inherit.self(baseBlocks, props, staticProps))._processLive(true);
        } else {
            (block = blocks[decl.block] = inherit(baseBlocks, props, staticProps))._name = decl.block;
            delete block._liveInitable;
        }

        return block;
    },

    declMix : function(block, props, staticProps) {
        convertModHandlersToMethods(props || (props = {}));
        return blocks[block] = inherit(props, staticProps);
    },

    /**
     * Processes a block's live properties
     * @private
     * @param {Boolean} [heedLive=false] Whether to take into account that the block already processed its live properties
     * @returns {Boolean} Whether the block is a live block
     */
    _processLive : function(heedLive) {
        return false;
    },

    /**
     * Factory method for creating an instance of the block named
     * @param {String|Object} block Block name or description
     * @param {Object} [params] Block parameters
     * @returns {BEM}
     */
    create : function(block, params) {
        typeof block === 'string' && (block = { block : block });

        return new blocks[block.block](block.mods, params);
    },

    /**
     * Returns the name of the current block
     * @returns {String}
     */
    getName : function() {
        return this._name;
    },

    /**
     * Adds an event handler
     * @param {String|Object} e Event type
     * @param {Object} [data] Additional data that the handler gets as e.data
     * @param {Function} fn Handler
     * @param {Object} [ctx] Handler context
     * @returns {Function} this
     */
    on : function(e, data, fn, ctx) {
        if(typeof e === 'object' && (functions.isFunction(data) || functions.isFunction(fn))) { // mod change event
            e = this._buildModEventName(e);
        }

        return this.__base.apply(this, arguments);
    },

    /**
     * Removes event handler or handlers
     * @param {String|Object} [e] Event type
     * @param {Function} [fn] Handler
     * @param {Object} [ctx] Handler context
     * @returns {Function} this
     */
    un : function(e, fn, ctx) {
        if(typeof e === 'object' && functions.isFunction(fn)) { // mod change event
            e = this._buildModEventName(e);
        }

        return this.__base.apply(this, arguments);
    },

    _buildModEventName : function(modEvent) {
        var res = MOD_DELIM + modEvent.modName + MOD_DELIM + (modEvent.modVal === false? '' : modEvent.modVal);
        modEvent.elem && (res = ELEM_DELIM + modEvent.elem + res);
        return res;
    },

    /**
     * Retrieves the name of an element nested in a block
     * @private
     * @param {Object} elem Nested element
     * @returns {String|undefined}
     */
    _extractElemNameFrom : function(elem) {},

    /**
     * Executes the block init functions
     * @private
     */
    _runInitFns : function() {
        if(initFns.length) {
            var fns = initFns,
                fn, i = 0;

            initFns = [];
            while(fn = fns[i]) {
                fn.call(fns[i + 1]);
                i += 2;
            }
        }
    }
});

provide(BEM);

});

/* end: ../libs/bem-core/common.blocks/i-bem/i-bem.vanilla.js */
/* begin: ../libs/bem-core/common.blocks/i-bem/__internal/i-bem__internal.vanilla.js */
/**
 * @module i-bem__internal
 */

modules.define('i-bem__internal', function(provide) {

var undef,
    /**
     * Separator for modifiers and their values
     * @const
     * @type String
     */
    MOD_DELIM = '_',

    /**
     * Separator between names of a block and a nested element
     * @const
     * @type String
     */
    ELEM_DELIM = '__',

    /**
     * Pattern for acceptable element and modifier names
     * @const
     * @type String
     */
    NAME_PATTERN = '[a-zA-Z0-9-]+';

function isSimple(obj) {
    var typeOf = typeof obj;
    return typeOf === 'string' || typeOf === 'number' || typeOf === 'boolean';
}

function buildModPostfix(modName, modVal) {
    var res = '';
    /* jshint eqnull: true */
    if(modVal != null && modVal !== false) {
        res += MOD_DELIM + modName;
        modVal !== true && (res += MOD_DELIM + modVal);
    }
    return res;
}

function buildBlockClass(name, modName, modVal) {
    return name + buildModPostfix(modName, modVal);
}

function buildElemClass(block, name, modName, modVal) {
    return buildBlockClass(block, undef, undef) +
        ELEM_DELIM + name +
        buildModPostfix(modName, modVal);
}

provide(/** @exports */{
    NAME_PATTERN : NAME_PATTERN,

    MOD_DELIM : MOD_DELIM,
    ELEM_DELIM : ELEM_DELIM,

    buildModPostfix : buildModPostfix,

    /**
     * Builds the class of a block or element with a modifier
     * @param {String} block Block name
     * @param {String} [elem] Element name
     * @param {String} [modName] Modifier name
     * @param {String|Number} [modVal] Modifier value
     * @returns {String} Class
     */
    buildClass : function(block, elem, modName, modVal) {
        if(isSimple(modName)) {
            if(!isSimple(modVal)) {
                modVal = modName;
                modName = elem;
                elem = undef;
            }
        } else if(typeof modName !== 'undefined') {
            modName = undef;
        } else if(elem && typeof elem !== 'string') {
            elem = undef;
        }

        if(!(elem || modName)) { // optimization for simple case
            return block;
        }

        return elem?
            buildElemClass(block, elem, modName, modVal) :
            buildBlockClass(block, modName, modVal);
    },

    /**
     * Builds full classes for a buffer or element with modifiers
     * @param {String} block Block name
     * @param {String} [elem] Element name
     * @param {Object} [mods] Modifiers
     * @returns {String} Class
     */
    buildClasses : function(block, elem, mods) {
        if(elem && typeof elem !== 'string') {
            mods = elem;
            elem = undef;
        }

        var res = elem?
            buildElemClass(block, elem, undef, undef) :
            buildBlockClass(block, undef, undef);

        if(mods) {
            for(var modName in mods) {
                if(mods.hasOwnProperty(modName) && mods[modName]) {
                    res += ' ' + (elem?
                        buildElemClass(block, elem, modName, mods[modName]) :
                        buildBlockClass(block, modName, mods[modName]));
                }
            }
        }

        return res;
    }
});

});

/* end: ../libs/bem-core/common.blocks/i-bem/__internal/i-bem__internal.vanilla.js */
/* begin: ../libs/bem-core/common.blocks/inherit/inherit.vanilla.js */
/**
 * @module inherit
 * @version 2.2.1
 * @author Filatov Dmitry <dfilatov@yandex-team.ru>
 * @description This module provides some syntax sugar for "class" declarations, constructors, mixins, "super" calls and static members.
 */

(function(global) {

var hasIntrospection = (function(){'_';}).toString().indexOf('_') > -1,
    emptyBase = function() {},
    hasOwnProperty = Object.prototype.hasOwnProperty,
    objCreate = Object.create || function(ptp) {
        var inheritance = function() {};
        inheritance.prototype = ptp;
        return new inheritance();
    },
    objKeys = Object.keys || function(obj) {
        var res = [];
        for(var i in obj) {
            hasOwnProperty.call(obj, i) && res.push(i);
        }
        return res;
    },
    extend = function(o1, o2) {
        for(var i in o2) {
            hasOwnProperty.call(o2, i) && (o1[i] = o2[i]);
        }

        return o1;
    },
    toStr = Object.prototype.toString,
    isArray = Array.isArray || function(obj) {
        return toStr.call(obj) === '[object Array]';
    },
    isFunction = function(obj) {
        return toStr.call(obj) === '[object Function]';
    },
    noOp = function() {},
    needCheckProps = true,
    testPropObj = { toString : '' };

for(var i in testPropObj) { // fucking ie hasn't toString, valueOf in for
    testPropObj.hasOwnProperty(i) && (needCheckProps = false);
}

var specProps = needCheckProps? ['toString', 'valueOf'] : null;

function getPropList(obj) {
    var res = objKeys(obj);
    if(needCheckProps) {
        var specProp, i = 0;
        while(specProp = specProps[i++]) {
            obj.hasOwnProperty(specProp) && res.push(specProp);
        }
    }

    return res;
}

function override(base, res, add) {
    var addList = getPropList(add),
        j = 0, len = addList.length,
        name, prop;
    while(j < len) {
        if((name = addList[j++]) === '__self') {
            continue;
        }
        prop = add[name];
        if(isFunction(prop) &&
                (!hasIntrospection || prop.toString().indexOf('.__base') > -1)) {
            res[name] = (function(name, prop) {
                var baseMethod = base[name]?
                        base[name] :
                        name === '__constructor'? // case of inheritance from plane function
                            res.__self.__parent :
                            noOp;
                return function() {
                    var baseSaved = this.__base;
                    this.__base = baseMethod;
                    var res = prop.apply(this, arguments);
                    this.__base = baseSaved;
                    return res;
                };
            })(name, prop);
        } else {
            res[name] = prop;
        }
    }
}

function applyMixins(mixins, res) {
    var i = 1, mixin;
    while(mixin = mixins[i++]) {
        res?
            isFunction(mixin)?
                inherit.self(res, mixin.prototype, mixin) :
                inherit.self(res, mixin) :
            res = isFunction(mixin)?
                inherit(mixins[0], mixin.prototype, mixin) :
                inherit(mixins[0], mixin);
    }
    return res || mixins[0];
}

/**
* Creates class
* @exports
* @param {Function|Array} [baseClass|baseClassAndMixins] class (or class and mixins) to inherit from
* @param {Object} prototypeFields
* @param {Object} [staticFields]
* @returns {Function} class
*/
function inherit() {
    var args = arguments,
        withMixins = isArray(args[0]),
        hasBase = withMixins || isFunction(args[0]),
        base = hasBase? withMixins? applyMixins(args[0]) : args[0] : emptyBase,
        props = args[hasBase? 1 : 0] || {},
        staticProps = args[hasBase? 2 : 1],
        res = props.__constructor || (hasBase && base.prototype.__constructor)?
            function() {
                return this.__constructor.apply(this, arguments);
            } :
            hasBase?
                function() {
                    return base.apply(this, arguments);
                } :
                function() {};

    if(!hasBase) {
        res.prototype = props;
        res.prototype.__self = res.prototype.constructor = res;
        return extend(res, staticProps);
    }

    extend(res, base);

    res.__parent = base;

    var basePtp = base.prototype,
        resPtp = res.prototype = objCreate(basePtp);

    resPtp.__self = resPtp.constructor = res;

    props && override(basePtp, resPtp, props);
    staticProps && override(base, res, staticProps);

    return res;
}

inherit.self = function() {
    var args = arguments,
        withMixins = isArray(args[0]),
        base = withMixins? applyMixins(args[0], args[0][0]) : args[0],
        props = args[1],
        staticProps = args[2],
        basePtp = base.prototype;

    props && override(basePtp, basePtp, props);
    staticProps && override(base, base, staticProps);

    return base;
};

var defineAsGlobal = true;
if(typeof exports === 'object') {
    module.exports = inherit;
    defineAsGlobal = false;
}

if(typeof modules === 'object') {
    modules.define('inherit', function(provide) {
        provide(inherit);
    });
    defineAsGlobal = false;
}

if(typeof define === 'function') {
    define(function(require, exports, module) {
        module.exports = inherit;
    });
    defineAsGlobal = false;
}

defineAsGlobal && (global.inherit = inherit);

})(this);

/* end: ../libs/bem-core/common.blocks/inherit/inherit.vanilla.js */
/* begin: ../libs/bem-core/common.blocks/identify/identify.vanilla.js */
/**
 * @module identify
 */

modules.define('identify', function(provide) {

var counter = 0,
    expando = '__' + (+new Date),
    get = function() {
        return 'uniq' + (++counter);
    };

provide(
    /**
     * Makes unique ID
     * @exports
     * @param {Object} obj Object that needs to be identified
     * @param {Boolean} [onlyGet=false] Return a unique value only if it had already been assigned before
     * @returns {String} ID
     */
    function(obj, onlyGet) {
        if(!obj) return get();

        var key = 'uniqueID' in obj? 'uniqueID' : expando; // Use when possible native uniqueID for elements in IE

        return onlyGet || key in obj?
            obj[key] :
            obj[key] = get();
    }
);

});

/* end: ../libs/bem-core/common.blocks/identify/identify.vanilla.js */
/* begin: ../libs/bem-core/common.blocks/next-tick/next-tick.vanilla.js */
/**
 * @module next-tick
 */

modules.define('next-tick', function(provide) {

/**
 * Executes given function on next tick.
 * @exports
 * @type Function
 * @param {Function} fn
 */

var global = this.global,
    fns = [],
    enqueueFn = function(fn) {
        return fns.push(fn) === 1;
    },
    callFns = function() {
        var fnsToCall = fns, i = 0, len = fns.length;
        fns = [];
        while(i < len) {
            fnsToCall[i++]();
        }
    };

    /* global process */
    if(typeof process === 'object' && process.nextTick) { // nodejs
        return provide(function(fn) {
            enqueueFn(fn) && process.nextTick(callFns);
        });
    }

    if(global.setImmediate) { // ie10
        return provide(function(fn) {
            enqueueFn(fn) && global.setImmediate(callFns);
        });
    }

    if(global.postMessage) { // modern browsers
        var isPostMessageAsync = true;
        if(global.attachEvent) {
            var checkAsync = function() {
                    isPostMessageAsync = false;
                };
            global.attachEvent('onmessage', checkAsync);
            global.postMessage('__checkAsync', '*');
            global.detachEvent('onmessage', checkAsync);
        }

        if(isPostMessageAsync) {
            var msg = '__nextTick' + (+new Date),
                onMessage = function(e) {
                    if(e.data === msg) {
                        e.stopPropagation && e.stopPropagation();
                        callFns();
                    }
                };

            global.addEventListener?
                global.addEventListener('message', onMessage, true) :
                global.attachEvent('onmessage', onMessage);

            return provide(function(fn) {
                enqueueFn(fn) && global.postMessage(msg, '*');
            });
        }
    }

    var doc = global.document;
    if('onreadystatechange' in doc.createElement('script')) { // ie6-ie8
        var head = doc.getElementsByTagName('head')[0],
            createScript = function() {
                var script = doc.createElement('script');
                script.onreadystatechange = function() {
                    script.parentNode.removeChild(script);
                    script = script.onreadystatechange = null;
                    callFns();
                };
                head.appendChild(script);
            };

        return provide(function(fn) {
            enqueueFn(fn) && createScript();
        });
    }

    provide(function(fn) { // old browsers
        enqueueFn(fn) && global.setTimeout(callFns, 0);
    });
});

/* end: ../libs/bem-core/common.blocks/next-tick/next-tick.vanilla.js */
/* begin: ../libs/bem-core/common.blocks/objects/objects.vanilla.js */
/**
 * @module objects
 * @description A set of helpers to work with JavaScript objects
 */

modules.define('objects', function(provide) {

var hasOwnProp = Object.prototype.hasOwnProperty;

provide(/** @exports */{
    /**
     * Extends a given target by
     * @param {Object} target object to extend
     * @param {...Object} source
     * @returns {Object}
     */
    extend : function(target, source) {
        typeof target !== 'object' && (target = {});

        for(var i = 1, len = arguments.length; i < len; i++) {
            var obj = arguments[i];
            if(obj) {
                for(var key in obj) {
                    hasOwnProp.call(obj, key) && (target[key] = obj[key]);
                }
            }
        }

        return target;
    },

    /**
     * Check whether a given object is empty (contains no enumerable properties)
     * @param {Object} obj
     * @returns {Boolean}
     */
    isEmpty : function(obj) {
        for(var key in obj) {
            if(hasOwnProp.call(obj, key)) {
                return false;
            }
        }

        return true;
    },

    /**
     * Generic iterator function over object
     * @param {Object} obj object to iterate
     * @param {Function} fn callback
     * @param {Object} [ctx] callbacks's context
     */
    each : function(obj, fn, ctx) {
        for(var key in obj) {
            if(hasOwnProp.call(obj, key)) {
                ctx? fn.call(ctx, obj[key], key) : fn(obj[key], key);
            }
        }
    }
});

});

/* end: ../libs/bem-core/common.blocks/objects/objects.vanilla.js */
/* begin: ../libs/bem-core/common.blocks/functions/functions.vanilla.js */
/**
 * @module functions
 * @description A set of helpers to work with JavaScript functions
 */

modules.define('functions', function(provide) {

var toStr = Object.prototype.toString;

provide(/** @exports */{
    /**
     * Checks whether a given object is function
     * @param {*} obj
     * @returns {Boolean}
     */
    isFunction : function(obj) {
        return toStr.call(obj) === '[object Function]';
    },

    /**
     * Empty function
     */
    noop : function() {}
});

});

/* end: ../libs/bem-core/common.blocks/functions/functions.vanilla.js */
/* begin: ../libs/bem-core/common.blocks/events/events.vanilla.js */
/**
 * @module events
 */

modules.define(
    'events',
    ['identify', 'inherit', 'functions'],
    function(provide, identify, inherit, functions) {

var undef,
    storageExpando = '__' + (+new Date) + 'storage',
    getFnId = function(fn, ctx) {
        return identify(fn) + (ctx? identify(ctx) : '');
    },

    /**
     * @class Event
     * @exports events:Event
     */
    Event = inherit(/** @lends Event.prototype */{
        /**
         * @constructor
         * @param {String} type
         * @param {Object} target
         */
        __constructor : function(type, target) {
            /**
             * Type
             * @member {String} Event
             */
            this.type = type;

            /**
             * Target
             * @member {String} Event
             */
            this.target = target;

            /**
             * Result
             * @member {*}
             */
            this.result = undef;

            /**
             * Data
             * @member {*}
             */
            this.data = undef;

            this._isDefaultPrevented = false;
            this._isPropagationStopped = false;
        },

        /**
         * Prevents default action
         */
        preventDefault : function() {
            this._isDefaultPrevented = true;
        },

        /**
         * Returns whether is default action prevented
         * @returns {Boolean}
         */
        isDefaultPrevented : function() {
            return this._isDefaultPrevented;
        },

        /**
         * Stops propagation
         */
        stopPropagation : function() {
            this._isPropagationStopped = true;
        },

        /**
         * Returns whether is propagation stopped
         * @returns {Boolean}
         */
        isPropagationStopped : function() {
            return this._isPropagationStopped;
        }
    }),

    /**
     * @lends Emitter
     * @lends Emitter.prototype
     */
    EmitterProps = {
        /**
         * Adds an event handler
         * @param {String} e Event type
         * @param {Object} [data] Additional data that the handler gets as e.data
         * @param {Function} fn Handler
         * @param {Object} [ctx] Handler context
         * @returns {Emitter} this
         */
        on : function(e, data, fn, ctx, _special) {
            if(typeof e === 'string') {
                if(functions.isFunction(data)) {
                    ctx = fn;
                    fn = data;
                    data = undef;
                }

                var id = getFnId(fn, ctx),
                    storage = this[storageExpando] || (this[storageExpando] = {}),
                    eventTypes = e.split(' '), eventType,
                    i = 0, list, item,
                    eventStorage;

                while(eventType = eventTypes[i++]) {
                    eventStorage = storage[eventType] || (storage[eventType] = { ids : {}, list : {} });
                    if(!(id in eventStorage.ids)) {
                        list = eventStorage.list;
                        item = { fn : fn, data : data, ctx : ctx, special : _special };
                        if(list.last) {
                            list.last.next = item;
                            item.prev = list.last;
                        } else {
                            list.first = item;
                        }
                        eventStorage.ids[id] = list.last = item;
                    }
                }
            } else {
                for(var key in e) {
                    e.hasOwnProperty(key) && this.on(key, e[key], data, _special);
                }
            }

            return this;
        },

        /**
         * Adds a one time handler for the event.
         * Handler is executed only the next time the event is fired, after which it is removed.
         * @param {String} e Event type
         * @param {Object} [data] Additional data that the handler gets as e.data
         * @param {Function} fn Handler
         * @param {Object} [ctx] Handler context
         * @returns {Emitter} this
         */
        once : function(e, data, fn, ctx) {
            return this.on(e, data, fn, ctx, { once : true });
        },

        /**
         * Removes event handler or handlers
         * @param {String} [e] Event type
         * @param {Function} [fn] Handler
         * @param {Object} [ctx] Handler context
         * @returns {Emitter} this
         */
        un : function(e, fn, ctx) {
            if(typeof e === 'string' || typeof e === 'undefined') {
                var storage = this[storageExpando];
                if(storage) {
                    if(e) { // if event type was passed
                        var eventTypes = e.split(' '),
                            i = 0, eventStorage;
                        while(e = eventTypes[i++]) {
                            if(eventStorage = storage[e]) {
                                if(fn) {  // if specific handler was passed
                                    var id = getFnId(fn, ctx),
                                        ids = eventStorage.ids;
                                    if(id in ids) {
                                        var list = eventStorage.list,
                                            item = ids[id],
                                            prev = item.prev,
                                            next = item.next;

                                        if(prev) {
                                            prev.next = next;
                                        } else if(item === list.first) {
                                            list.first = next;
                                        }

                                        if(next) {
                                            next.prev = prev;
                                        } else if(item === list.last) {
                                            list.last = prev;
                                        }

                                        delete ids[id];
                                    }
                                } else {
                                    delete this[storageExpando][e];
                                }
                            }
                        }
                    } else {
                        delete this[storageExpando];
                    }
                }
            } else {
                for(var key in e) {
                    e.hasOwnProperty(key) && this.un(key, e[key], fn);
                }
            }

            return this;
        },

        /**
         * Fires event handlers
         * @param {String|events:Event} e Event
         * @param {Object} [data] Additional data
         * @returns {Emitter} this
         */
        emit : function(e, data) {
            var storage = this[storageExpando],
                eventInstantiated = false;

            if(storage) {
                var eventTypes = [typeof e === 'string'? e : e.type, '*'],
                    i = 0, eventType, eventStorage;
                while(eventType = eventTypes[i++]) {
                    if(eventStorage = storage[eventType]) {
                        var item = eventStorage.list.first,
                            lastItem = eventStorage.list.last,
                            res;
                        while(item) {
                            if(!eventInstantiated) { // instantiate Event only on demand
                                eventInstantiated = true;
                                typeof e === 'string' && (e = new Event(e));
                                e.target || (e.target = this);
                            }

                            e.data = item.data;
                            res = item.fn.apply(item.ctx || this, arguments);
                            if(typeof res !== 'undefined') {
                                e.result = res;
                                if(res === false) {
                                    e.preventDefault();
                                    e.stopPropagation();
                                }
                            }

                            item.special && item.special.once &&
                                this.un(e.type, item.fn, item.ctx);

                            if(item === lastItem) {
                                break;
                            }

                            item = item.next;
                        }
                    }
                }
            }

            return this;
        }
    },
    /**
     * @class Emitter
     * @exports events:Emitter
     */
    Emitter = inherit(
        EmitterProps,
        EmitterProps);

provide({
    Emitter : Emitter,
    Event : Event
});

});

/* end: ../libs/bem-core/common.blocks/events/events.vanilla.js */
/* begin: ../blocks/socket/socket.js */
/* borschik:include:../libs/socket.io-client/dist/socket.io.js */

/* end: ../blocks/socket/socket.js */
/* begin: ../libs/bem-core/common.blocks/i-bem/__dom/i-bem__dom.js */
/**
 * @module i-bem__dom
 */

modules.define(
    'i-bem__dom',
    ['i-bem', 'i-bem__internal', 'identify', 'objects', 'functions', 'jquery', 'dom'],
    function(provide, BEM, INTERNAL, identify, objects, functions, $, dom) {

var undef,
    win = $(window),
    doc = $(document),

    /**
     * Storage for DOM elements by unique key
     * @type Object
     */
    uniqIdToDomElems = {},

    /**
     * Storage for blocks by unique key
     * @type Object
     */
    uniqIdToBlock = {},

    /**
     * Storage for DOM element's parent nodes
     * @type Object
     */
    domNodesToParents = {},

    /**
     * Storage for block parameters
     * @type Object
     */
    domElemToParams = {},

    /**
     * Storage for liveCtx event handlers
     * @type Object
     */
    liveEventCtxStorage = {},

    /**
     * Storage for liveClass event handlers
     * @type Object
     */
    liveClassEventStorage = {},

    blocks = BEM.blocks,

    BEM_CLASS = 'i-bem',
    BEM_SELECTOR = '.' + BEM_CLASS,
    BEM_PARAMS_ATTR = 'data-bem',

    NAME_PATTERN = INTERNAL.NAME_PATTERN,

    MOD_DELIM = INTERNAL.MOD_DELIM,
    ELEM_DELIM = INTERNAL.ELEM_DELIM,

    EXTRACT_MODS_RE = RegExp(
        '[^' + MOD_DELIM + ']' + MOD_DELIM + '(' + NAME_PATTERN + ')' +
        '(?:' + MOD_DELIM + '(' + NAME_PATTERN + '))?$'),

    buildModPostfix = INTERNAL.buildModPostfix,
    buildClass = INTERNAL.buildClass,

    reverse = Array.prototype.reverse;

/**
 * Initializes blocks on a DOM element
 * @param {jQuery} domElem DOM element
 * @param {String} uniqInitId ID of the "initialization wave"
 */
function initBlocks(domElem, uniqInitId) {
    var domNode = domElem[0],
        params = getParams(domNode),
        blockName;

    for(blockName in params)
        initBlock(
            blockName,
            domElem,
            processParams(params[blockName], blockName, uniqInitId));
}

/**
 * Initializes a specific block on a DOM element, or returns the existing block if it was already created
 * @param {String} blockName Block name
 * @param {jQuery} domElem DOM element
 * @param {Object} [params] Initialization parameters
 * @param {Boolean} [forceLive=false] Force live initialization
 * @param {Function} [callback] Handler to call after complete initialization
 */
function initBlock(blockName, domElem, params, forceLive, callback) {
    var domNode = domElem[0];

    params || (params = processParams(getBlockParams(domNode, blockName), blockName));

    var uniqId = params.uniqId,
        block = uniqIdToBlock[uniqId];

    if(block) {
        if(block.domElem.index(domNode) < 0) {
            block.domElem = block.domElem.add(domElem);
            objects.extend(block.params, params);
        }

        return block;
    }

    uniqIdToDomElems[uniqId] = uniqIdToDomElems[uniqId]?
        uniqIdToDomElems[uniqId].add(domElem) :
        domElem;

    var parentDomNode = domNode.parentNode;
    if(!parentDomNode || parentDomNode.nodeType === 11) { // jquery doesn't unique disconnected node
        $.unique(uniqIdToDomElems[uniqId]);
    }

    var blockClass = blocks[blockName] || DOM.decl(blockName, {}, { live : true }, true);
    if(!(blockClass._liveInitable = !!blockClass._processLive()) || forceLive || params.live === false) {
        forceLive && domElem.addClass(BEM_CLASS); // add css class for preventing memory leaks in further destructing

        block = new blockClass(uniqIdToDomElems[uniqId], params, !!forceLive);

        delete uniqIdToDomElems[uniqId];
        callback && callback.apply(block, Array.prototype.slice.call(arguments, 4));
        return block;
    }
}

/**
 * Processes and adds necessary block parameters
 * @param {Object} params Initialization parameters
 * @param {String} blockName Block name
 * @param {String} [uniqInitId] ID of the "initialization wave"
 */
function processParams(params, blockName, uniqInitId) {
    params.uniqId ||
        (params.uniqId = (params.id?
            blockName + '-id-' + params.id :
            identify()) + (uniqInitId || identify()));

    return params;
}

/**
 * Helper for searching for a DOM element using a selector inside the context, including the context itself
 * @param {jQuery} ctx Context
 * @param {String} selector CSS selector
 * @param {Boolean} [excludeSelf=false] Exclude context from search
 * @returns {jQuery}
 */
function findDomElem(ctx, selector, excludeSelf) {
    var res = ctx.find(selector);
    return excludeSelf?
       res :
       res.add(ctx.filter(selector));
}

/**
 * Returns parameters of a block's DOM element
 * @param {HTMLElement} domNode DOM node
 * @returns {Object}
 */
function getParams(domNode, blockName) {
    var uniqId = identify(domNode);
    return domElemToParams[uniqId] ||
        (domElemToParams[uniqId] = extractParams(domNode));
}

/**
 * Returns parameters of a block extracted from DOM node
 * @param {HTMLElement} domNode DOM node
 * @param {String} blockName
 * @returns {Object}
 */

function getBlockParams(domNode, blockName) {
    var params = getParams(domNode);
    return params[blockName] || (params[blockName] = {});
}

/**
 * Retrieves block parameters from a DOM element
 * @param {HTMLElement} domNode DOM node
 * @returns {Object}
 */
function extractParams(domNode) {
    var attrVal = domNode.getAttribute(BEM_PARAMS_ATTR);
    return attrVal? JSON.parse(attrVal) : {};
}

/**
 * Uncouple DOM node from the block. If this is the last node, then destroys the block.
 * @param {BEMDOM} block block
 * @param {HTMLElement} domNode DOM node
 */
function removeDomNodeFromBlock(block, domNode) {
    block.domElem.length === 1?
        block._destruct() :
        block.domElem = block.domElem.not(domNode);
}

/**
 * Fills DOM node's parent nodes to the storage
 * @param {jQuery} domElem
 */
function storeDomNodeParents(domElem) {
    domElem.each(function() {
        domNodesToParents[identify(this)] = this.parentNode;
    });
}

/**
 * @class BEMDOM
 * @description Base block for creating BEM blocks that have DOM representation
 * @exports
 */

var DOM = BEM.decl('i-bem__dom',/** @lends BEMDOM.prototype */{
    /**
     * @constructor
     * @private
     * @param {jQuery} domElem DOM element that the block is created on
     * @param {Object} params Block parameters
     * @param {Boolean} [initImmediately=true]
     */
    __constructor : function(domElem, params, initImmediately) {
        /**
         * DOM elements of block
         * @member {jQuery}
         * @readonly
         */
        this.domElem = domElem;

        /**
         * Cache for names of events on DOM elements
         * @member {Object}
         * @private
         */
        this._eventNameCache = {};

        /**
         * Cache for elements
         * @member {Object}
         * @private
         */
        this._elemCache = {};

        /**
         * @member {String} Unique block ID
         * @private
         */
        this._uniqId = params.uniqId;

        uniqIdToBlock[this._uniqId] = this;

        /**
         * @member {Boolean} Flag for whether it's necessary to unbind from the document and window when destroying the block
         * @private
         */
        this._needSpecialUnbind = false;

        this.__base(null, params, initImmediately);
    },

    /**
     * Finds blocks inside the current block or its elements (including context)
     * @param {String|jQuery} [elem] Block element
     * @param {String|Object} block Name or description (block,modName,modVal) of the block to find
     * @returns {BEMDOM[]}
     */
    findBlocksInside : function(elem, block) {
        return this._findBlocks('find', elem, block);
    },

    /**
     * Finds the first block inside the current block or its elements (including context)
     * @param {String|jQuery} [elem] Block element
     * @param {String|Object} block Name or description (block,modName,modVal) of the block to find
     * @returns {BEMDOM}
     */
    findBlockInside : function(elem, block) {
        return this._findBlocks('find', elem, block, true);
    },

    /**
     * Finds blocks outside the current block or its elements (including context)
     * @param {String|jQuery} [elem] Block element
     * @param {String|Object} block Name or description (block,modName,modVal) of the block to find
     * @returns {BEMDOM[]}
     */
    findBlocksOutside : function(elem, block) {
        return this._findBlocks('parents', elem, block);
    },

    /**
     * Finds the first block outside the current block or its elements (including context)
     * @param {String|jQuery} [elem] Block element
     * @param {String|Object} block Name or description (block,modName,modVal) of the block to find
     * @returns {BEMDOM}
     */
    findBlockOutside : function(elem, block) {
        return this._findBlocks('closest', elem, block)[0] || null;
    },

    /**
     * Finds blocks on DOM elements of the current block or its elements
     * @param {String|jQuery} [elem] Block element
     * @param {String|Object} block Name or description (block,modName,modVal) of the block to find
     * @returns {BEMDOM[]}
     */
    findBlocksOn : function(elem, block) {
        return this._findBlocks('', elem, block);
    },

    /**
     * Finds the first block on DOM elements of the current block or its elements
     * @param {String|jQuery} [elem] Block element
     * @param {String|Object} block Name or description (block,modName,modVal) of the block to find
     * @returns {BEMDOM}
     */
    findBlockOn : function(elem, block) {
        return this._findBlocks('', elem, block, true);
    },

    _findBlocks : function(select, elem, block, onlyFirst) {
        if(!block) {
            block = elem;
            elem = undef;
        }

        var ctxElem = elem?
                (typeof elem === 'string'? this.findElem(elem) : elem) :
                this.domElem,
            isSimpleBlock = typeof block === 'string',
            blockName = isSimpleBlock? block : (block.block || block.blockName),
            selector = '.' +
                (isSimpleBlock?
                    buildClass(blockName) :
                    buildClass(blockName, block.modName, block.modVal)) +
                (onlyFirst? ':first' : ''),
            domElems = ctxElem.filter(selector);

        select && (domElems = domElems.add(ctxElem[select](selector)));

        if(onlyFirst) {
            return domElems[0]? initBlock(blockName, domElems.eq(0), undef, true) : null;
        }

        var res = [],
            uniqIds = {};

        domElems.each(function(i, domElem) {
            var block = initBlock(blockName, $(domElem), undef, true);
            if(!uniqIds[block._uniqId]) {
                uniqIds[block._uniqId] = true;
                res.push(block);
            }
        });

        return res;
    },

    /**
     * Adds an event handler for any DOM element
     * @protected
     * @param {jQuery} domElem DOM element where the event will be listened for
     * @param {String|Object} event Event name or event object
     * @param {Object} [data] Additional event data
     * @param {Function} fn Handler function, which will be executed in the block's context
     * @returns {BEMDOM} this
     */
    bindToDomElem : function(domElem, event, data, fn) {
        if(functions.isFunction(data)) {
            fn = data;
            data = undef;
        }

        fn?
            domElem.bind(
                this._buildEventName(event),
                data,
                $.proxy(fn, this)) :
            objects.each(event, function(fn, event) {
                this.bindToDomElem(domElem, event, data, fn);
            }, this);

        return this;
    },

    /**
     * Adds an event handler to the document
     * @protected
     * @param {String|Object} event Event name or event object
     * @param {Object} [data] Additional event data
     * @param {Function} fn Handler function, which will be executed in the block's context
     * @returns {BEMDOM} this
     */
    bindToDoc : function(event, data, fn) {
        this._needSpecialUnbind = true;
        return this.bindToDomElem(doc, event, data, fn);
    },

    /**
     * Adds an event handler to the window
     * @protected
     * @param {String|Object} event Event name or event object
     * @param {Object} [data] Additional event data
     * @param {Function} fn Handler function, which will be executed in the block's context
     * @returns {BEMDOM} this
     */
    bindToWin : function(event, data, fn) {
        this._needSpecialUnbind = true;
        return this.bindToDomElem(win, event, data, fn);
    },

    /**
     * Adds an event handler to the block's main DOM elements or its nested elements
     * @protected
     * @param {jQuery|String} [elem] Element
     * @param {String|Object} event Event name or event object
     * @param {Object} [data] Additional event data
     * @param {Function} fn Handler function, which will be executed in the block's context
     * @returns {BEMDOM} this
     */
    bindTo : function(elem, event, data, fn) {
        var len = arguments.length;
        if(len === 3) {
            if(functions.isFunction(data)) {
                fn = data;
                if(typeof event === 'object') {
                    data = event;
                    event = elem;
                    elem = this.domElem;
                }
            }
        } else if(len === 2) {
            if(functions.isFunction(event)) {
                fn = event;
                event = elem;
                elem = this.domElem;
            } else if(!(typeof elem === 'string' || elem instanceof $)) {
                data = event;
                event = elem;
                elem = this.domElem;
            }
        } else if(len === 1) {
            event = elem;
            elem = this.domElem;
        }

        typeof elem === 'string' && (elem = this.elem(elem));

        return this.bindToDomElem(elem, event, data, fn);
    },

    /**
     * Removes event handlers from any DOM element
     * @protected
     * @param {jQuery} domElem DOM element where the event was being listened for
     * @param {String|Object} event Event name or event object
     * @param {Function} [fn] Handler function
     * @returns {BEMDOM} this
     */
    unbindFromDomElem : function(domElem, event, fn) {
        if(typeof event === 'string') {
            event = this._buildEventName(event);
            fn?
                domElem.unbind(event, fn) :
                domElem.unbind(event);
        } else {
            objects.each(event, function(fn, event) {
                this.unbindFromDomElem(domElem, event, fn);
            }, this);
        }

        return this;
    },

    /**
     * Removes event handler from document
     * @protected
     * @param {String|Object} event Event name or event object
     * @param {Function} [fn] Handler function
     * @returns {BEMDOM} this
     */
    unbindFromDoc : function(event, fn) {
        return this.unbindFromDomElem(doc, event, fn);
    },

    /**
     * Removes event handler from window
     * @protected
     * @param {String|Object} event Event name or event object
     * @param {Function} [fn] Handler function
     * @returns {BEMDOM} this
     */
    unbindFromWin : function(event, fn) {
        return this.unbindFromDomElem(win, event, fn);
    },

    /**
     * Removes event handlers from the block's main DOM elements or its nested elements
     * @protected
     * @param {jQuery|String} [elem] Nested element
     * @param {String|Object} event Event name or event object
     * @param {Function} [fn] Handler function
     * @returns {BEMDOM} this
     */
    unbindFrom : function(elem, event, fn) {
        var argLen = arguments.length;
        if(argLen === 1) {
            event = elem;
            elem = this.domElem;
        } else if(argLen === 2 && functions.isFunction(event)) {
            fn = event;
            event = elem;
            elem = this.domElem;
        } else if(typeof elem === 'string') {
            elem = this.elem(elem);
        }

        return this.unbindFromDomElem(elem, event, fn);
    },

    /**
     * Builds a full name for an event
     * @private
     * @param {String} event Event name
     * @returns {String}
     */
    _buildEventName : function(event) {
        return event.indexOf(' ') > 1?
            event.split(' ').map(function(e) {
                return this._buildOneEventName(e);
            }, this).join(' ') :
            this._buildOneEventName(event);
    },

    /**
     * Builds a full name for a single event
     * @private
     * @param {String} event Event name
     * @returns {String}
     */
    _buildOneEventName : function(event) {
        var eventNameCache = this._eventNameCache;

        if(event in eventNameCache) return eventNameCache[event];

        var uniq = '.' + this._uniqId;

        if(event.indexOf('.') < 0) return eventNameCache[event] = event + uniq;

        var lego = '.bem_' + this.__self._name;

        return eventNameCache[event] = event.split('.').map(function(e, i) {
            return i === 0? e + lego : lego + '_' + e;
        }).join('') + uniq;
    },

    _ctxEmit : function(e, data) {
        this.__base.apply(this, arguments);

        var _this = this,
            storage = liveEventCtxStorage[_this.__self._buildCtxEventName(e.type)],
            ctxIds = {};

        storage && _this.domElem.each(function(_, ctx) {
            var counter = storage.counter;
            while(ctx && counter) {
                var ctxId = identify(ctx, true);
                if(ctxId) {
                    if(ctxIds[ctxId]) break;
                    var storageCtx = storage.ctxs[ctxId];
                    if(storageCtx) {
                        objects.each(storageCtx, function(handler) {
                            handler.fn.call(
                                handler.ctx || _this,
                                e,
                                data);
                        });
                        counter--;
                    }
                    ctxIds[ctxId] = true;
                }
                ctx = ctx.parentNode || domNodesToParents[ctxId];
            }
        });
    },

    /**
     * Sets a modifier for a block/nested element
     * @param {jQuery} [elem] Nested element
     * @param {String} modName Modifier name
     * @param {String} modVal Modifier value
     * @returns {BEMDOM} this
     */
    setMod : function(elem, modName, modVal) {
        if(elem && typeof modVal !== 'undefined' && elem.length > 1) {
            var _this = this;
            elem.each(function() {
                var item = $(this);
                item.__bemElemName = elem.__bemElemName;
                _this.setMod(item, modName, modVal);
            });
            return _this;
        }
        return this.__base(elem, modName, modVal);
    },

    /**
     * Retrieves modifier value from the DOM node's CSS class
     * @private
     * @param {String} modName Modifier name
     * @param {jQuery} [elem] Nested element
     * @param {String} [elemName] Name of the nested element
     * @returns {String} Modifier value
     */
    _extractModVal : function(modName, elem, elemName) {
        var domNode = (elem || this.domElem)[0],
            matches;

        domNode &&
            (matches = domNode.className
                .match(this.__self._buildModValRE(modName, elemName || elem)));

        return matches? matches[2] || true : '';
    },

    /**
     * Retrieves a name/value list of modifiers
     * @private
     * @param {Array} [modNames] Names of modifiers
     * @param {Object} [elem] Element
     * @returns {Object} Hash of modifier values by names
     */
    _extractMods : function(modNames, elem) {
        var res = {},
            extractAll = !modNames.length,
            countMatched = 0;

        ((elem || this.domElem)[0].className
            .match(this.__self._buildModValRE(
                '(' + (extractAll? NAME_PATTERN : modNames.join('|')) + ')',
                elem,
                'g')) || []).forEach(function(className) {
                    var matches = className.match(EXTRACT_MODS_RE);
                    res[matches[1]] = matches[2] || true;
                    ++countMatched;
                });

        // empty modifier values are not reflected in classes; they must be filled with empty values
        countMatched < modNames.length && modNames.forEach(function(modName) {
            modName in res || (res[modName] = '');
        });

        return res;
    },

    /**
     * Sets a modifier's CSS class for a block's DOM element or nested element
     * @private
     * @param {String} modName Modifier name
     * @param {String} modVal Modifier value
     * @param {String} oldModVal Old modifier value
     * @param {jQuery} [elem] Element
     * @param {String} [elemName] Element name
     */
    _onSetMod : function(modName, modVal, oldModVal, elem, elemName) {
        if(modName !== 'js' || modVal !== '') {
            var _self = this.__self,
                classPrefix = _self._buildModClassPrefix(modName, elemName),
                classRE = _self._buildModValRE(modName, elemName),
                needDel = modVal === '' || modVal === false;

            (elem || this.domElem).each(function() {
                var className = this.className,
                    modClassName = classPrefix;

                modVal !== true && (modClassName += MOD_DELIM + modVal);

                (oldModVal === true?
                    classRE.test(className) :
                    className.indexOf(classPrefix + MOD_DELIM) > -1)?
                        this.className = className.replace(
                            classRE,
                            (needDel? '' : '$1' + modClassName)) :
                        needDel || $(this).addClass(modClassName);
            });

            elemName && this
                .dropElemCache(elemName, modName, oldModVal)
                .dropElemCache(elemName, modName, modVal);
        }

        this.__base.apply(this, arguments);
    },

    /**
     * Finds elements nested in a block
     * @param {jQuery} [ctx=this.domElem] Element where search is being performed
     * @param {String} names Nested element name (or names separated by spaces)
     * @param {String} [modName] Modifier name
     * @param {String} [modVal] Modifier value
     * @param {Boolean} [strictMode=false]
     * @returns {jQuery} DOM elements
     */
    findElem : function(ctx, names, modName, modVal, strictMode) {
        if(typeof ctx === 'string') {
            strictMode = modVal;
            modVal = modName;
            modName = names;
            names = ctx;
            ctx = this.domElem;
        }

        if(typeof modName === 'boolean') {
            strictMode = modName;
            modName = undef;
        }

        var _self = this.__self,
            selector = '.' +
                names.split(' ').map(function(name) {
                    return _self.buildClass(name, modName, modVal);
                }).join(',.'),
            res = findDomElem(ctx, selector);

        return strictMode? this._filterFindElemResults(res) : res;
    },

    /**
     * Filters results of findElem helper execution in strict mode
     * @param {jQuery} res DOM elements
     * @returns {jQuery} DOM elements
     */
    _filterFindElemResults : function(res) {
        var blockSelector = this.buildSelector(),
            domElem = this.domElem;
        return res.filter(function() {
            return domElem.index($(this).closest(blockSelector)) > -1;
        });
    },

    /**
     * Finds elements nested in a block
     * @private
     * @param {String} name Nested element name
     * @param {String} [modName] Modifier name
     * @param {String} [modVal] Modifier value
     * @returns {jQuery} DOM elements
     */
    _elem : function(name, modName, modVal) {
        var key = name + buildModPostfix(modName, modVal),
            res;

        if(!(res = this._elemCache[key])) {
            res = this._elemCache[key] = this.findElem(name, modName, modVal);
            res.__bemElemName = name;
        }

        return res;
    },

    /**
     * Lazy search for elements nested in a block (caches results)
     * @param {String} names Nested element name (or names separated by spaces)
     * @param {String} [modName] Modifier name
     * @param {String} [modVal] Modifier value
     * @returns {jQuery} DOM elements
     */
    elem : function(names, modName, modVal) {
        if(modName && typeof modName !== 'string') {
            modName.__bemElemName = names;
            return modName;
        }

        if(names.indexOf(' ') < 0) {
            return this._elem(names, modName, modVal);
        }

        var res = $([]);
        names.split(' ').forEach(function(name) {
            res = res.add(this._elem(name, modName, modVal));
        }, this);
        return res;
    },

    /**
     * Finds elements outside the context
     * @param {jQuery} ctx context
     * @param {String} elemName Element name
     * @returns {jQuery} DOM elements
     */
    closestElem : function(ctx, elemName) {
        return ctx.closest(this.buildSelector(elemName));
    },

    /**
     * Clearing the cache for elements
     * @protected
     * @param {String} [names] Nested element name (or names separated by spaces)
     * @param {String} [modName] Modifier name
     * @param {String} [modVal] Modifier value
     * @returns {BEMDOM} this
     */
    dropElemCache : function(names, modName, modVal) {
        if(names) {
            var modPostfix = buildModPostfix(modName, modVal);
            names.indexOf(' ') < 0?
                delete this._elemCache[names + modPostfix] :
                names.split(' ').forEach(function(name) {
                    delete this._elemCache[name + modPostfix];
                }, this);
        } else {
            this._elemCache = {};
        }

        return this;
    },

    /**
     * Retrieves parameters of a block element
     * @param {String|jQuery} elem Element
     * @returns {Object} Parameters
     */
    elemParams : function(elem) {
        var elemName;
        if(typeof elem === 'string') {
            elemName = elem;
            elem = this.elem(elem);
        } else {
            elemName = this.__self._extractElemNameFrom(elem);
        }

        return extractParams(elem[0])[this.__self.buildClass(elemName)] || {};
    },

    /**
     * Elemify given element
     * @param {jQuery} elem Element
     * @param {String} elemName Name
     * @returns {jQuery}
     */
    elemify : function(elem, elemName) {
        (elem = $(elem)).__bemElemName = elemName;
        return elem;
    },

    /**
     * Checks whether a DOM element is in a block
     * @protected
     * @param {jQuery} [ctx=this.domElem] Element where check is being performed
     * @param {jQuery} domElem DOM element
     * @returns {Boolean}
     */
    containsDomElem : function(ctx, domElem) {
        if(arguments.length === 1) {
            domElem = ctx;
            ctx = this.domElem;
        }

        return dom.contains(ctx, domElem);
    },

    /**
     * Builds a CSS selector corresponding to a block/element and modifier
     * @param {String} [elem] Element name
     * @param {String} [modName] Modifier name
     * @param {String} [modVal] Modifier value
     * @returns {String}
     */
    buildSelector : function(elem, modName, modVal) {
        return this.__self.buildSelector(elem, modName, modVal);
    },

    /**
     * Destructs a block
     * @private
     */
    _destruct : function() {
        var _this = this,
            _self = _this.__self;

        _this._needSpecialUnbind && _self.doc.add(_self.win).unbind('.' + _this._uniqId);

        _this.__base();

        delete uniqIdToBlock[_this.un()._uniqId];
    }

}, /** @lends BEMDOM */{

    /**
     * Scope, will be set on onDomReady to `<body>`
     * @type jQuery
     */
    scope : null,

    /**
     * Document shortcut
     * @type jQuery
     */
    doc : doc,

    /**
     * Window shortcut
     * @type jQuery
     */
    win : win,

    /**
     * Processes a block's live properties
     * @private
     * @param {Boolean} [heedLive=false] Whether to take into account that the block already processed its live properties
     * @returns {Boolean} Whether the block is a live block
     */
    _processLive : function(heedLive) {
        var res = this._liveInitable;

        if('live' in this) {
            var noLive = typeof res === 'undefined';

            if(noLive ^ heedLive) { // should be opposite to each other
                res = this.live() !== false;

                var blockName = this.getName(),
                    origLive = this.live;

                this.live = function() {
                    return this.getName() === blockName?
                        res :
                        origLive.apply(this, arguments);
                };
            }
        }

        return res;
    },

    /**
     * Initializes blocks on a fragment of the DOM tree
     * @param {jQuery|String} [ctx=scope] Root DOM node
     * @returns {jQuery} ctx Initialization context
     */
    init : function(ctx) {
        if(typeof ctx === 'string') {
            ctx = $(ctx);
        } else if(!ctx) ctx = DOM.scope;

        var uniqInitId = identify();
        findDomElem(ctx, BEM_SELECTOR).each(function() {
            initBlocks($(this), uniqInitId);
        });

        this._runInitFns();

        return ctx;
    },

    /**
     * Destroys blocks on a fragment of the DOM tree
     * @param {jQuery} ctx Root DOM node
     * @param {Boolean} [excludeSelf=false] Exclude the main domElem
     */
    destruct : function(ctx, excludeSelf) {
        var _ctx;
        if(excludeSelf) {
            storeDomNodeParents(_ctx = ctx.children());
            ctx.empty();
        } else {
            storeDomNodeParents(_ctx = ctx);
            ctx.remove();
        }

        reverse.call(findDomElem(_ctx, BEM_SELECTOR)).each(function(_, domNode) {
            var params = getParams(domNode);
            objects.each(params, function(blockParams) {
                if(blockParams.uniqId) {
                    var block = uniqIdToBlock[blockParams.uniqId];
                    block?
                        removeDomNodeFromBlock(block, domNode) :
                        delete uniqIdToDomElems[blockParams.uniqId];
                }
            });
            delete domElemToParams[identify(domNode)];
        });

        // flush parent nodes storage that has been filled above
        domNodesToParents = {};
    },

    /**
     * Replaces a fragment of the DOM tree inside the context, destroying old blocks and intializing new ones
     * @param {jQuery} ctx Root DOM node
     * @param {jQuery|String} content New content
     * @returns {jQuery} Updated root DOM node
     */
    update : function(ctx, content) {
        this.destruct(ctx, true);
        return this.init(ctx.html(content));
    },

    /**
     * Changes a fragment of the DOM tree including the context and initializes blocks.
     * @param {jQuery} ctx Root DOM node
     * @param {jQuery|String} content Content to be added
     * @returns {jQuery} New content
     */
    replace : function(ctx, content) {
        var prev = ctx.prev(),
            parent = ctx.parent();

        this.destruct(ctx);

        return this.init(prev.length?
            $(content).insertAfter(prev) :
            $(content).prependTo(parent));
    },

    /**
     * Adds a fragment of the DOM tree at the end of the context and initializes blocks
     * @param {jQuery} ctx Root DOM node
     * @param {jQuery|String} content Content to be added
     * @returns {jQuery} New content
     */
    append : function(ctx, content) {
        return this.init($(content).appendTo(ctx));
    },

    /**
     * Adds a fragment of the DOM tree at the beginning of the context and initializes blocks
     * @param {jQuery} ctx Root DOM node
     * @param {jQuery|String} content Content to be added
     * @returns {jQuery} New content
     */
    prepend : function(ctx, content) {
        return this.init($(content).prependTo(ctx));
    },

    /**
     * Adds a fragment of the DOM tree before the context and initializes blocks
     * @param {jQuery} ctx Contextual DOM node
     * @param {jQuery|String} content Content to be added
     * @returns {jQuery} New content
     */
    before : function(ctx, content) {
        return this.init($(content).insertBefore(ctx));
    },

    /**
     * Adds a fragment of the DOM tree after the context and initializes blocks
     * @param {jQuery} ctx Contextual DOM node
     * @param {jQuery|String} content Content to be added
     * @returns {jQuery} New content
     */
    after : function(ctx, content) {
        return this.init($(content).insertAfter(ctx));
    },

    /**
     * Builds a full name for a live event
     * @private
     * @param {String} e Event name
     * @returns {String}
     */
    _buildCtxEventName : function(e) {
        return this._name + ':' + e;
    },

    _liveClassBind : function(className, e, callback, invokeOnInit) {
        if(e.indexOf(' ') > -1) {
            e.split(' ').forEach(function(e) {
                this._liveClassBind(className, e, callback, invokeOnInit);
            }, this);
        } else {
            var storage = liveClassEventStorage[e],
                uniqId = identify(callback);

            if(!storage) {
                storage = liveClassEventStorage[e] = {};
                DOM.scope.bind(e, $.proxy(this._liveClassTrigger, this));
            }

            storage = storage[className] || (storage[className] = { uniqIds : {}, fns : [] });

            if(!(uniqId in storage.uniqIds)) {
                storage.fns.push({ uniqId : uniqId, fn : this._buildLiveEventFn(callback, invokeOnInit) });
                storage.uniqIds[uniqId] = storage.fns.length - 1;
            }
        }

        return this;
    },

    _liveClassUnbind : function(className, e, callback) {
        var storage = liveClassEventStorage[e];
        if(storage) {
            if(callback) {
                if(storage = storage[className]) {
                    var uniqId = identify(callback);
                    if(uniqId in storage.uniqIds) {
                        var i = storage.uniqIds[uniqId],
                            len = storage.fns.length - 1;
                        storage.fns.splice(i, 1);
                        while(i < len) storage.uniqIds[storage.fns[i++].uniqId] = i - 1;
                        delete storage.uniqIds[uniqId];
                    }
                }
            } else {
                delete storage[className];
            }
        }

        return this;
    },

    _liveClassTrigger : function(e) {
        var storage = liveClassEventStorage[e.type];
        if(storage) {
            var node = e.target, classNames = [];
            for(var className in storage) {
                classNames.push(className);
            }
            do {
                var nodeClassName = ' ' + node.className + ' ', i = 0;
                while(className = classNames[i++]) {
                    if(nodeClassName.indexOf(' ' + className + ' ') > -1) {
                        var j = 0, fns = storage[className].fns, fn, stopPropagationAndPreventDefault = false;
                        while(fn = fns[j++])
                            if(fn.fn.call($(node), e) === false) stopPropagationAndPreventDefault = true;

                        stopPropagationAndPreventDefault && e.preventDefault();
                        if(stopPropagationAndPreventDefault || e.isPropagationStopped()) return;

                        classNames.splice(--i, 1);
                    }
                }
            } while(classNames.length && (node = node.parentNode));
        }
    },

    _buildLiveEventFn : function(callback, invokeOnInit) {
        var _this = this;
        return function(e) {
            e.currentTarget = this;
            var args = [
                    _this._name,
                    $(this).closest(_this.buildSelector()),
                    undef,
                    true
                ],
                block = initBlock.apply(null, invokeOnInit? args.concat([callback, e]) : args);

            if(block && !invokeOnInit && callback)
                return callback.apply(block, arguments);
        };
    },

    /**
     * Helper for live initialization for an event on DOM elements of a block or its elements
     * @protected
     * @param {String} [elemName] Element name or names (separated by spaces)
     * @param {String} event Event name
     * @param {Function} [callback] Handler to call after successful initialization
     */
    liveInitOnEvent : function(elemName, event, callback) {
        return this.liveBindTo(elemName, event, callback, true);
    },

    /**
     * Helper for subscribing to live events on DOM elements of a block or its elements
     * @protected
     * @param {String|Object} [to] Description (object with modName, modVal, elem) or name of the element or elements (space-separated)
     * @param {String} event Event name
     * @param {Function} [callback] Handler
     */
    liveBindTo : function(to, event, callback, invokeOnInit) {
        if(!event || functions.isFunction(event)) {
            callback = event;
            event = to;
            to = undef;
        }

        if(!to || typeof to === 'string') {
            to = { elem : to };
        }

        if(to.elem && to.elem.indexOf(' ') > 0) {
            to.elem.split(' ').forEach(function(elem) {
                this._liveClassBind(
                    this.buildClass(elem, to.modName, to.modVal),
                    event,
                    callback,
                    invokeOnInit);
            }, this);
            return this;
        }

        return this._liveClassBind(
            this.buildClass(to.elem, to.modName, to.modVal),
            event,
            callback,
            invokeOnInit);
    },

    /**
     * Helper for unsubscribing from live events on DOM elements of a block or its elements
     * @protected
     * @param {String} [elem] Name of the element or elements (space-separated)
     * @param {String} event Event name
     * @param {Function} [callback] Handler
     */
    liveUnbindFrom : function(elem, event, callback) {

        if(!event || functions.isFunction(event)) {
            callback = event;
            event = elem;
            elem = undef;
        }

        if(elem && elem.indexOf(' ') > 1) {
            elem.split(' ').forEach(function(elem) {
                this._liveClassUnbind(
                    this.buildClass(elem),
                    event,
                    callback);
            }, this);
            return this;
        }

        return this._liveClassUnbind(
            this.buildClass(elem),
            event,
            callback);
    },

    /**
     * Helper for live initialization when a different block is initialized
     * @private
     * @param {String} event Event name
     * @param {String} blockName Name of the block that should trigger a reaction when initialized
     * @param {Function} callback Handler to be called after successful initialization in the new block's context
     * @param {String} findFnName Name of the method for searching
     */
    _liveInitOnBlockEvent : function(event, blockName, callback, findFnName) {
        var name = this._name;
        blocks[blockName].on(event, function(e) {
            var args = arguments,
                blocks = e.target[findFnName](name);

            callback && blocks.forEach(function(block) {
                callback.apply(block, args);
            });
        });
        return this;
    },

    /**
     * Helper for live initialization for a different block's event on the current block's DOM element
     * @protected
     * @param {String} event Event name
     * @param {String} blockName Name of the block that should trigger a reaction when initialized
     * @param {Function} callback Handler to be called after successful initialization in the new block's context
     */
    liveInitOnBlockEvent : function(event, blockName, callback) {
        return this._liveInitOnBlockEvent(event, blockName, callback, 'findBlocksOn');
    },

    /**
     * Helper for live initialization for a different block's event inside the current block
     * @protected
     * @param {String} event Event name
     * @param {String} blockName Name of the block that should trigger a reaction when initialized
     * @param {Function} [callback] Handler to be called after successful initialization in the new block's context
     */
    liveInitOnBlockInsideEvent : function(event, blockName, callback) {
        return this._liveInitOnBlockEvent(event, blockName, callback, 'findBlocksOutside');
    },

    /**
     * Adds a live event handler to a block, based on a specified element where the event will be listened for
     * @param {jQuery} [ctx] The element in which the event will be listened for
     * @param {String} e Event name
     * @param {Object} [data] Additional information that the handler gets as e.data
     * @param {Function} fn Handler
     * @param {Object} [fnCtx] Handler's context
     */
    on : function(ctx, e, data, fn, fnCtx) {
        return typeof ctx === 'object' && ctx.jquery?
            this._liveCtxBind(ctx, e, data, fn, fnCtx) :
            this.__base(ctx, e, data, fn);
    },

    /**
     * Removes the live event handler from a block, based on a specified element where the event was being listened for
     * @param {jQuery} [ctx] The element in which the event was being listened for
     * @param {String} e Event name
     * @param {Function} [fn] Handler
     * @param {Object} [fnCtx] Handler context
     */
    un : function(ctx, e, fn, fnCtx) {
        return typeof ctx === 'object' && ctx.jquery?
            this._liveCtxUnbind(ctx, e, fn, fnCtx) :
            this.__base(ctx, e, fn);
    },

    /**
     * Adds a live event handler to a block, based on a specified element where the event will be listened for
     * @private
     * @param {jQuery} ctx The element in which the event will be listened for
     * @param {String} e  Event name
     * @param {Object} [data] Additional information that the handler gets as e.data
     * @param {Function} fn Handler
     * @param {Object} [fnCtx] Handler context
     * @returns {BEMDOM} this
     */
    _liveCtxBind : function(ctx, e, data, fn, fnCtx) {
        if(typeof e === 'object') {
            if(functions.isFunction(data) || functions.isFunction(fn)) { // mod change event
                e = this._buildModEventName(e);
            } else {
                objects.each(e, function(fn, e) {
                    this._liveCtxBind(ctx, e, fn, data);
                }, this);
                return this;
            }
        }

        if(functions.isFunction(data)) {
            fnCtx = fn;
            fn = data;
            data = undef;
        }

        if(e.indexOf(' ') > -1) {
            e.split(' ').forEach(function(e) {
                this._liveCtxBind(ctx, e, data, fn, fnCtx);
            }, this);
        } else {
            var ctxE = this._buildCtxEventName(e),
                storage = liveEventCtxStorage[ctxE] ||
                    (liveEventCtxStorage[ctxE] = { counter : 0, ctxs : {} });

            ctx.each(function() {
                var ctxId = identify(this),
                    ctxStorage = storage.ctxs[ctxId];
                if(!ctxStorage) {
                    ctxStorage = storage.ctxs[ctxId] = {};
                    ++storage.counter;
                }
                ctxStorage[identify(fn) + (fnCtx? identify(fnCtx) : '')] = {
                    fn : fn,
                    data : data,
                    ctx : fnCtx
                };
            });
        }

        return this;
    },

    /**
     * Removes a live event handler from a block, based on a specified element where the event was being listened for
     * @private
     * @param {jQuery} ctx The element in which the event was being listened for
     * @param {String|Object} e Event name
     * @param {Function} [fn] Handler
     * @param {Object} [fnCtx] Handler context
     */
    _liveCtxUnbind : function(ctx, e, fn, fnCtx) {
        if(typeof e === 'object' && functions.isFunction(fn)) { // mod change event
            e = this._buildModEventName(e);
        }

        var storage = liveEventCtxStorage[e = this._buildCtxEventName(e)];

        if(storage) {
            ctx.each(function() {
                var ctxId = identify(this, true),
                    ctxStorage;
                if(ctxId && (ctxStorage = storage.ctxs[ctxId])) {
                    fn && delete ctxStorage[identify(fn) + (fnCtx? identify(fnCtx) : '')];
                    if(!fn || objects.isEmpty(ctxStorage)) {
                        storage.counter--;
                        delete storage.ctxs[ctxId];
                    }
                }
            });
            storage.counter || delete liveEventCtxStorage[e];
        }

        return this;
    },

    /**
     * Retrieves the name of an element nested in a block
     * @private
     * @param {jQuery} elem Nested element
     * @returns {String|undef}
     */
    _extractElemNameFrom : function(elem) {
        if(elem.__bemElemName) return elem.__bemElemName;

        var matches = elem[0].className.match(this._buildElemNameRE());
        return matches? matches[1] : undef;
    },

    /**
     * Builds a prefix for the CSS class of a DOM element or nested element of the block, based on modifier name
     * @private
     * @param {String} modName Modifier name
     * @param {jQuery|String} [elem] Element
     * @returns {String}
     */
    _buildModClassPrefix : function(modName, elem) {
        return this._name +
               (elem?
                   ELEM_DELIM + (typeof elem === 'string'? elem : this._extractElemNameFrom(elem)) :
                   '') +
               MOD_DELIM + modName;
    },

    /**
     * Builds a regular expression for extracting modifier values from a DOM element or nested element of a block
     * @private
     * @param {String} modName Modifier name
     * @param {jQuery|String} [elem] Element
     * @param {String} [quantifiers] Regular expression quantifiers
     * @returns {RegExp}
     */
    _buildModValRE : function(modName, elem, quantifiers) {
        return new RegExp(
            '(\\s|^)' +
            this._buildModClassPrefix(modName, elem) +
            '(?:' + MOD_DELIM + '(' + NAME_PATTERN + '))?(?=\\s|$)',
            quantifiers);
    },

    /**
     * Builds a regular expression for extracting names of elements nested in a block
     * @private
     * @returns {RegExp}
     */
    _buildElemNameRE : function() {
        return new RegExp(this._name + ELEM_DELIM + '(' + NAME_PATTERN + ')(?:\\s|$)');
    },

    /**
     * Builds a CSS class corresponding to the block/element and modifier
     * @param {String} [elem] Element name
     * @param {String} [modName] Modifier name
     * @param {String} [modVal] Modifier value
     * @returns {String}
     */
    buildClass : function(elem, modName, modVal) {
        return buildClass(this._name, elem, modName, modVal);
    },

    /**
     * Builds a CSS selector corresponding to the block/element and modifier
     * @param {String} [elem] Element name
     * @param {String} [modName] Modifier name
     * @param {String} [modVal] Modifier value
     * @returns {String}
     */
    buildSelector : function(elem, modName, modVal) {
        return '.' + this.buildClass(elem, modName, modVal);
    }
});

/**
 * Returns a block on a DOM element and initializes it if necessary
 * @param {String} blockName Block name
 * @param {Object} params Block parameters
 * @returns {BEMDOM}
 */
$.fn.bem = function(blockName, params) {
    return initBlock(blockName, this, params, true);
};

// Set default scope after DOM ready
$(function() {
    DOM.scope = $('body');
});

provide(DOM);

});

(function() {

var origDefine = modules.define;

modules.define = function(name, deps, decl) {
    origDefine.apply(modules, arguments);

    name !== 'i-bem__dom_init' && arguments.length > 2 && ~deps.indexOf('i-bem__dom') &&
        modules.define('i-bem__dom_init', [name], function(provide, _, prev) {
            provide(prev);
        });
};

})();

/* end: ../libs/bem-core/common.blocks/i-bem/__dom/i-bem__dom.js */
/* begin: ../libs/bem-core/common.blocks/jquery/jquery.js */
/**
 * @module jquery
 * @description Provide jQuery (load if it does not exist).
 */

modules.define(
    'jquery',
    ['loader_type_js', 'jquery__config'],
    function(provide, loader, cfg) {

/* global jQuery */

function doProvide(preserveGlobal) {
    /**
     * @exports
     * @type Function
     */
    provide(preserveGlobal? jQuery : jQuery.noConflict(true));
}

typeof jQuery !== 'undefined'?
    doProvide(true) :
    loader(cfg.url, doProvide);
});

/* end: ../libs/bem-core/common.blocks/jquery/jquery.js */
/* begin: ../libs/bem-core/common.blocks/jquery/__config/jquery__config.js */
/**
 * @module jquery__config
 * @description Configuration for jQuery
 */

modules.define('jquery__config', function(provide) {

provide(/** @exports */{
    /**
     * URL for loading jQuery if it does not exist
     */
    url : '//yastatic.net/jquery/2.1.1/jquery.min.js'
});

});

/* end: ../libs/bem-core/common.blocks/jquery/__config/jquery__config.js */
/* begin: ../libs/bem-core/desktop.blocks/jquery/__config/jquery__config.js */
/**
 * @module jquery__config
 * @description Configuration for jQuery
 */

modules.define(
    'jquery__config',
    ['ua', 'objects'],
    function(provide, ua, objects, base) {

provide(
    ua.msie && parseInt(ua.version, 10) < 9?
        objects.extend(
            base,
            {
                url : '//yastatic.net/jquery/1.11.1/jquery.min.js'
            }) :
        base);

});

/* end: ../libs/bem-core/desktop.blocks/jquery/__config/jquery__config.js */
/* begin: ../libs/bem-core/desktop.blocks/ua/ua.js */
/** 
 * @module ua
 * @description Detect some user agent features (works like jQuery.browser in jQuery 1.8)
 * @see http://code.jquery.com/jquery-migrate-1.1.1.js
 */

modules.define('ua', function(provide) {

var ua = navigator.userAgent.toLowerCase(),
    match = /(chrome)[ \/]([\w.]+)/.exec(ua) ||
        /(webkit)[ \/]([\w.]+)/.exec(ua) ||
        /(opera)(?:.*version|)[ \/]([\w.]+)/.exec(ua) ||
        /(msie) ([\w.]+)/.exec(ua) ||
        ua.indexOf('compatible') < 0 && /(mozilla)(?:.*? rv:([\w.]+)|)/.exec(ua) ||
        [],
    matched = {
        browser : match[1] || '',
        version : match[2] || '0'
    },
    browser = {};

if(matched.browser) {
    browser[matched.browser] = true;
    browser.version = matched.version;
}

if(browser.chrome) {
    browser.webkit = true;
} else if(browser.webkit) {
    browser.safari = true;
}

/**
 * @exports
 * @type Object
 */
provide(browser);

});

/* end: ../libs/bem-core/desktop.blocks/ua/ua.js */
/* begin: ../libs/bem-core/common.blocks/dom/dom.js */
/**
 * @module dom
 * @description some DOM utils
 */

modules.define('dom', ['jquery'], function(provide, $) {

provide(/** @exports */{
    /**
     * Checks whether a DOM elem is in a context
     * @param {jQuery} ctx DOM elem where check is being performed
     * @param {jQuery} domElem DOM elem to check
     * @returns {Boolean}
     */
    contains : function(ctx, domElem) {
        var res = false;

        domElem.each(function() {
            var domNode = this;
            do {
                if(~ctx.index(domNode)) return !(res = true);
            } while(domNode = domNode.parentNode);

            return res;
        });

        return res;
    },

    /**
     * Returns current focused DOM elem in document
     * @returns {jQuery}
     */
    getFocused : function() {
        // "Error: Unspecified error." in iframe in IE9
        try { return $(document.activeElement); } catch(e) {}
    },

    /**
     * Checks whether a DOM element contains focus
     * @param {jQuery} domElem
     * @returns {Boolean}
     */
    containsFocus : function(domElem) {
        return this.contains(domElem, this.getFocused());
    },

    /**
    * Checks whether a browser currently can set focus on DOM elem
    * @param {jQuery} domElem
    * @returns {Boolean}
    */
    isFocusable : function(domElem) {
        var domNode = domElem[0];

        if(!domNode) return false;
        if(domNode.hasAttribute('tabindex')) return true;

        switch(domNode.tagName.toLowerCase()) {
            case 'iframe':
                return true;

            case 'input':
            case 'button':
            case 'textarea':
            case 'select':
                return !domNode.disabled;

            case 'a':
                return !!domNode.href;
        }

        return false;
    },

    /**
    * Checks whether a domElem is intended to edit text
    * @param {jQuery} domElem
    * @returns {Boolean}
    */
    isEditable : function(domElem) {
        var domNode = domElem[0];

        if(!domNode) return false;

        switch(domNode.tagName.toLowerCase()) {
            case 'input':
                var type = domNode.type;
                return (type === 'text' || type === 'password') && !domNode.disabled && !domNode.readOnly;

            case 'textarea':
                return !domNode.disabled && !domNode.readOnly;

            default:
                return domNode.contentEditable === 'true';
        }
    }
});

});

/* end: ../libs/bem-core/common.blocks/dom/dom.js */
/* begin: ../libs/bem-core/common.blocks/i-bem/__dom/_init/i-bem__dom_init.js */
/**
 * @module i-bem__dom_init
 */

modules.define('i-bem__dom_init', ['i-bem__dom'], function(provide, BEMDOM) {

provide(
    /**
     * Initializes blocks on a fragment of the DOM tree
     * @exports
     * @param {jQuery} [ctx=scope] Root DOM node
     * @returns {jQuery} ctx Initialization context
     */
    function(ctx) {
        return BEMDOM.init(ctx);
    });
});

/* end: ../libs/bem-core/common.blocks/i-bem/__dom/_init/i-bem__dom_init.js */
/* begin: ../blocks/welcome/_countdown/welcome_countdown.js */
modules.define('welcome', ['i-bem__dom', 'jquery', 'BEMHTML'], function(provide, BEMDOM, $, BEMHTML) {

provide(BEMDOM.decl({ block : this.name, modName: 'countdown' }, {
    onSetMod : {
        'js' : {
            'inited' : function() {
                var jsParams = JSON.parse($(this.domElem).attr('data-bem')),
                    time = jsParams && jsParams.welcome && jsParams.welcome.time,
                    elem = this.findElem('time-min');

                if (time) {
                    var timer = setInterval(function () {
                        elem.html(printTime(--time));

                        time || clearInterval(timer);
                    }, 1000);
                }
            }
        }
    }
}));

});

function printTime(time) {
    return time < 10 ? '0' + time : time;
}

/* end: ../blocks/welcome/_countdown/welcome_countdown.js */
/* begin: ../libs/bem-core/common.blocks/i-bem/__dom/_init/i-bem__dom_init_auto.js */
/**
 * Auto initialization on DOM ready
 */

modules.require(
    ['i-bem__dom_init', 'jquery', 'next-tick'],
    function(init, $, nextTick) {

$(function() {
    nextTick(init);
});

});

/* end: ../libs/bem-core/common.blocks/i-bem/__dom/_init/i-bem__dom_init_auto.js */
/* begin: ../libs/bem-core/common.blocks/loader/_type/loader_type_js.js */
/**
 * @module loader_type_js
 * @description Load JS from external URL.
 */

modules.define('loader_type_js', function(provide) {

var loading = {},
    loaded = {},
    head = document.getElementsByTagName('head')[0],
    onLoad = function(path) {
        loaded[path] = true;
        var cbs = loading[path], cb, i = 0;
        delete loading[path];
        while(cb = cbs[i++]) {
            cb();
        }
    };

provide(
    /**
     * @exports
     * @param {String} path resource link
     * @param {Function} cb executes when resource is loaded
     */
    function(path, cb) {
        if(loaded[path]) {
            cb();
            return;
        }

        if(loading[path]) {
            loading[path].push(cb);
            return;
        }

        loading[path] = [cb];

        var script = document.createElement('script');
        script.type = 'text/javascript';
        script.charset = 'utf-8';
        script.src = (location.protocol === 'file:' && !path.indexOf('//')? 'http:' : '') + path;
        script.onreadystatechange === null?
            script.onreadystatechange = function() {
                var readyState = this.readyState;
                if(readyState === 'loaded' || readyState === 'complete') {
                    script.onreadystatechange = null;
                    onLoad(path);
                }
            } :
            script.onload = script.onerror = function() {
                script.onload = script.onerror = null;
                onLoad(path);
            };

        head.insertBefore(script, head.lastChild);
    }
);

});

/* end: ../libs/bem-core/common.blocks/loader/_type/loader_type_js.js */
/* begin: ../blocks/page/page.js */
modules.define('page', ['i-bem__dom', 'jquery', 'BEMHTML'], function(provide, BEMDOM, $, BEMHTML) {

var pageState = -1;

provide(BEMDOM.decl({ block : this.name }, {
    onSetMod : {
        'js' : {
            'inited' : function() {
                var socket = io.connect('http://localhost:8001');
                var wrap = this.findElem('wrap');

                socket.on('event', function (data) {
                    var state = data && data.data && data.data.state;

                    if (state === 0) {
                        $.getJSON('http://localhost:8001/toplist.json', function (json) {
                            var users = json.data.filter(function (user) {
                                return user.current || user.place <= 5;
                            });

                            if (users.length === 6) {
                                users = [].concat(users.slice(0, 3), { place: '...' }, users.pop());
                            }

                            var html = BEMHTML.apply({
                                block: 'chart',
                                items: users
                            });

                            BEMDOM.update(wrap, html);
                        });
                    }

                    if (state === 1) {
                        var html = BEMHTML.apply({
                            block: 'welcome'
                        });

                        BEMDOM.update(wrap, html);
                    }

                    if (state === 2) {
                        var html = BEMHTML.apply({
                            block: 'welcome',
                            mods: { countdown: true },
                            time: data.data.timer
                        });

                        BEMDOM.update(wrap, html);
                    }

                    if (state === 3) {
                        if (pageState === 3) {
                            $('.shooting__scores').html(data.data.points);
                            $('.shooting__timer').html(printTime(data.data.timer));
                        } else {
                            var html = BEMHTML.apply({
                                block: 'shooting',
                                scores: data.data.points,
                                time: printTime(data.data.timer)
                            });

                            BEMDOM.update(wrap, html);
                        }
                    }

                    pageState = state;
                });
            }
        }
    }
}));

});

function printTime(time) {
    var min = parseInt(time / 60),
        sec = time - min * 60;

    return zeros(min) + ':' + zeros(sec);
}

function zeros(s) {
    s = '' + s;
    while (s.length < 2) {
        s = '0' + s;
    }
    return s;
}

/* end: ../blocks/page/page.js */
(function(g) {
  var __bem_xjst = function(exports) {
     /// -------------------------------------
/// ---------- Bootstrap start ----------
/// -------------------------------------
var __$$globalCtx = {"mode":"","block":"","elem":"","elemMods":null,"mods":null};
function run(templates, context) {
  var ignore = context.$ignore;
  var globalCtx = __$$globalCtx;
  if (!ignore) {
    context.$ignore = [];
    ignore = context.$ignore;
  }

  var index = 0;
  var currentId = null;
  var last = null;

  function template() {
    var id = index++;
    var match = !context.$override &&
                Array.prototype.every.call(arguments, function(cond) {
      try {
        return typeof cond === 'function' ? cond.call(context) : cond;
      } catch (e) {
        if (/Cannot read property/.test(e.message))
          return false;
      }
    });

    // Respect applyNext
    if (match && ignore.indexOf(id) !== -1) match = false;

    // Ignore body if match failed
    if (!match) return function() {};

    // Set current id
    currentId = id;

    return function bodyHandler(body) {
      last = {
        id: id,
        body: typeof body === 'function' ? body.bind(context)
                                         : function() { return body }
      };

      return null;
    };
  };

  function local() {
    var backup = [];
    var args = Array.prototype.slice.call(arguments);

    args.forEach(function(change) {
      if (change === null)
        return;

      if (typeof change !== 'object')
        throw new Error('apply() and local() accepts only object literals');

      Object.keys(change).forEach(function(key) {
        var parts = key.split('.'),
            newValue = change[key],
            oldValue,
            isGlobal = parts[0] === '$$global',
            subContext = isGlobal ? globalCtx : context;

        if (isGlobal) {
          parts.shift();
        }

        // Dive inside
        for (var i = 0; i < parts.length - 1; i++) {
          subContext = subContext[parts[i]];
        }

        // Set property and remember old value
        oldValue = subContext[parts[i]];
        subContext[parts[i]] = newValue;

        // Push old value to backup list
        backup.push({
          isGlobal: isGlobal,
          key: parts,
          value: oldValue
        });
      });
    });

    return function bodyHandler(body) {
      var result = typeof body === 'function' ? body.call(context) : body;

      // Rollback old values
      for (var i = backup.length - 1; i >= 0; i--) {
        var subContext = backup[i].isGlobal ? globalCtx : context,
            change = backup[i];

        // Dive inside
        for (var j = 0; j < change.key.length - 1; j++) {
          subContext = subContext[change.key[j]];
        }

        // Restore value
        subContext[change.key[j]] = change.value;
      }

      return result;
    };
  };

  function apply() {
    return local.apply(this, arguments)(function() {
      return run(templates, context);
    });
  };

  function applyNext() {
    return local.apply(this, arguments)(function() {
      var len = ignore.push(currentId);
      var ret = run(templates, context);
      if (len === ignore.length)
        ignore.pop();
      return ret;
    });
  };

  function oninit(cb) {
    if (context.$init) {
      if (context.$context && !context.$context.resetApplyNext) {
        context.$context.resetApplyNext = function(context) {
          context.$ignore.length = 0;
        };
      }

      cb(exports, context.$context);
    }
  }

  function fetch(name) {
    var parts = name.split('.'),
        value = globalCtx;

    // Dive inside
    for (var i = 0; i < parts.length; i++) {
      value = value[parts[i]];
    }

    return value;
  }

  function set(name, val) {
    var parts = name.split('.'),
        value = globalCtx;

    // Dive inside
    for (var i = 0; i < parts.length - 1; i++) {
      value = value[parts[i]];
    }
    value[parts[i]] = val;

    return value;
  };

  templates.call(context, template, local, apply, applyNext, oninit, fetch,
                 set);

  if (!last) {
    if (context.$init) return;
    throw new Error('Match failed');
  }

  return last.body();
};
exports.apply = function apply(ctx) {
  try {
    return applyc(ctx || this);
  } catch (e) {
    e.xjstContext = ctx || this;
    throw e;
  }
};function applyc(ctx) {
  return run(templates, ctx);
};
try {
  applyc({
    $init: true,
    $exports: exports,
    $context: {
      recordExtensions: function() {}
    }
  });
} catch (e) {
  // Just ignore any errors
}
function templates(template, local, apply, applyNext, oninit, __$$fetch, __$$set) {
/// -------------------------------------
/// ---------- Bootstrap end ------------
/// -------------------------------------

/// -------------------------------------
/// ---------- User code start ----------
/// -------------------------------------
/// -------------------------------------
/// --------- BEM-XJST Runtime Start ----
/// -------------------------------------

  var __$that = this,
      __$blockRef = {},
      __$elemRef = {},
      __$queue = [];

  // Called after all matches
  function __$flush() {
    __$queue.filter(function(item) {
      return !item.__$parent;
    }).forEach(function(item) {
      function apply(conditions, item) {
        if (item && item.__$children) {
          // Sub-template
          var subcond = conditions.concat(item.__$cond);
          item.__$children.forEach(function(child) {
            apply(subcond, child);
          });
        } else {
          var hasBlock = false;
          var hasElem = false;
          conditions = conditions.filter(function(cond) {
            if (cond === __$blockRef) {
              hasBlock = true;
              return false;
            }
            if (cond === __$elemRef) {
              hasElem = true;
              return false;
            }
            return true;
          });
          if (hasBlock && !hasElem) conditions.push(!__$that.elem);

          // Body
          template.apply(null, conditions)(item);
        }
      }
      apply([], item);
    });
  };

  // Matching
  function match() {
    function fn() {
      var args = Array.prototype.slice.call(arguments);

      args.forEach(function(arg) {
        if (arg && arg.__$children) {
          // Sub-template
          arg.__$parent = fn;
        }
        fn.__$children.push(arg);
      });

      // Handle match().match()
      var res = fn;
      while (res.__$parent) res = res.__$parent;
      return res;
    };
    __$queue.push(fn);
    fn.__$children = [];
    fn.__$parent = null;
    fn.__$cond = Array.prototype.slice.call(arguments);

    fn.match = match;
    fn.elemMatch = elemMatch;
    fn.block = block;
    fn.elem = elem;
    fn.mode = mode;
    fn.mod = mod;
    fn.elemMod = elemMod;
    fn.def = def;
    fn.tag = tag;
    fn.attrs = attrs;
    fn.cls = cls;
    fn.js = js;
    fn.jsAttr = jsAttr;
    fn.bem = bem;
    fn.mix = mix;
    fn.content = content;

    // match().match()
    if (this && this.__$children) {
      this.__$children.push(fn);
      fn.__$parent = this;
    }

    return fn;
  };

  function block(name) {
    return match.call(this, __$blockRef, __$that.block === name);
  };

  function elemMatch() {
    var args = Array.prototype.slice.call(arguments);
    return match.apply(this, [__$elemRef].concat(args));
  }

  function elem(name) {
    return match.call(this, __$elemRef, __$that.elem === name);
  };

  function mode(name) {
    return match.call(this, __$that._mode === name);
  };

  function mod(name, value) {
    return match.call(this, __$that.mods, function() {
      return __$that.mods[name] === value;
    });
  }

  function elemMod(name, value) {
    return match.call(this, __$that.elemMods, function() {
      return __$that.elemMods[name] === value;
    });
  }

  function def() { return mode.call(this, 'default'); };
  function tag() { return mode.call(this, 'tag'); };
  function attrs() { return mode.call(this,'attrs'); };
  function cls() { return mode.call(this, 'cls'); };
  function js() { return mode.call(this, 'js'); };
  function jsAttr() { return mode.call(this, 'jsAttr'); };
  function bem() { return mode.call(this, 'bem'); };
  function mix() { return mode.call(this, 'mix'); };
  function content() { return mode.call(this, 'content'); };

  // Apply by mode, local by mode and applyCtx
  apply = function(apply) {
    return function bemApply() {
      var args = Array.prototype.map.call(arguments, function(arg) {
        if (typeof arg === 'string') {
          return { _mode: arg };
        } else {
          return arg;
        }
      });
      return apply.apply(null, args);
    };
  }(apply);

  applyNext = function(applyNext) {
    return function bemApplyNext() {
      var args = Array.prototype.map.call(arguments, function(arg) {
        if (typeof arg === 'string') {
          return { _mode: arg };
        } else {
          return arg;
        }
      });
      return applyNext.apply(null, args);
    };
  }(applyNext);

  local = function(local) {
    return function bemLocal() {
      var args = Array.prototype.map.call(arguments, function(arg) {
        if (typeof arg === 'string') {
          return { _mode: arg };
        } else {
          return arg;
        }
      });
      return local.apply(null, args);
    };
  }(local);

  function applyCtx() {
    var context = arguments[arguments.length - 1];
    var rest = Array.prototype.slice.call(arguments, 0, -1);
    return applyNext.apply(this, [{ _mode: '', ctx: context }].concat(rest));
  };
;
;
/// -------------------------------------
/// --------- BEM-XJST Runtime End ------
/// -------------------------------------

/// -------------------------------------
/// ------ BEM-XJST User-code Start -----
/// -------------------------------------
/* begin: /Users/direvius/git/tank-show/libs/bem-core/common.blocks/i-bem/i-bem.bemhtml */
/* global oninit */

oninit(function(exports, context) {

var undef,
    BEM_ = {},
    toString = Object.prototype.toString,
    slice = Array.prototype.slice,
    isArray = Array.isArray || function(obj) {
        return toString.call(obj) === '[object Array]';
    },
    SHORT_TAGS = { // хэш для быстрого определения, является ли тэг коротким
        area : 1, base : 1, br : 1, col : 1, command : 1, embed : 1, hr : 1, img : 1,
        input : 1, keygen : 1, link : 1, meta : 1, param : 1, source : 1, wbr : 1 };

(function(BEM, undefined) {

/**
 * Separator for modifiers and their values
 * @const
 * @type String
 */
var MOD_DELIM = '_',

/**
 * Separator between block names and a nested element
 * @const
 * @type String
 */
    ELEM_DELIM = '__',

/**
 * Pattern for acceptable names of elements and modifiers
 * @const
 * @type String
 */
    NAME_PATTERN = '[a-zA-Z0-9-]+';

function buildModPostfix(modName, modVal) {
    var res = MOD_DELIM + modName;
    if(modVal !== true) res += MOD_DELIM + modVal;
    return res;
}

function buildBlockClass(name, modName, modVal) {
    var res = name;
    if(modVal) res += buildModPostfix(modName, modVal);
    return res;
}

function buildElemClass(block, name, modName, modVal) {
    var res = buildBlockClass(block) + ELEM_DELIM + name;
    if(modVal) res += buildModPostfix(modName, modVal);
    return res;
}

BEM.INTERNAL = {

    NAME_PATTERN : NAME_PATTERN,

    MOD_DELIM : MOD_DELIM,
    ELEM_DELIM : ELEM_DELIM,

    buildModPostfix : buildModPostfix,

    /**
     * Builds the class for a block or element with a modifier
     * @private
     * @param {String} block Block name
     * @param {String} [elem] Element name
     * @param {String} [modName] Modifier name
     * @param {String} [modVal] Element name
     * @returns {String} Class string
     */
    buildClass : function(block, elem, modName, modVal) {
        var typeOfModName = typeof modName;
        if(typeOfModName === 'string' || typeOfModName === 'boolean') {
            var typeOfModVal = typeof modVal;
            if(typeOfModVal !== 'string' && typeOfModVal !== 'boolean') {
                modVal = modName;
                modName = elem;
                elem = undef;
            }
        } else if(typeOfModName !== 'undefined') {
            modName = undef;
        } else if(elem && typeof elem !== 'string') {
            elem = undef;
        }

        if(!(elem || modName)) { // simple case optimization
            return block;
        }

        return elem?
            buildElemClass(block, elem, modName, modVal) :
            buildBlockClass(block, modName, modVal);
    },

    /**
     * Builds modifier classes
     * @private
     * @param {String} block Block name
     * @param {String} [elem] Element name
     * @param {Object} [mods] Modifier name
     * @returns {String} Class string
     */
    buildModsClasses : function(block, elem, mods) {
        var res = '';

        if(mods) {
            var modName; // TODO: do something with OmetaJS and YUI Compressor
            for(modName in mods) {
                if(!mods.hasOwnProperty(modName)) continue;

                var modVal = mods[modName];
                if(!modVal && modVal !== 0) continue;
                typeof modVal !== 'boolean' && (modVal += '');

                res += ' ' + (elem?
                    buildElemClass(block, elem, modName, modVal) :
                    buildBlockClass(block, modName, modVal));
            }
        }

        return res;
    },

    /**
     * Builds full classes for a block or element with modifiers
     * @private
     * @param {String} block Block name
     * @param {String} [elem] Element name
     * @param {Object} [mods] Modifier name
     * @returns {String} Class string
     */
    buildClasses : function(block, elem, mods) {
        var res = '';

        res += elem?
            buildElemClass(block, elem) :
            buildBlockClass(block);

        res += this.buildModsClasses(block, elem, mods);

        return res;
    }

};

})(BEM_);

var buildEscape = (function() {
    var ts = { '"' : '&quot;', '&' : '&amp;', '<' : '&lt;', '>' : '&gt;' },
        f = function(t) { return ts[t] || t; };
    return function(r) {
        r = new RegExp(r, 'g');
        return function(s) { return ('' + s).replace(r, f); };
    };
})();

context.BEMContext = BEMContext;

function BEMContext(context, apply_) {
    this.ctx = typeof context === 'undefined'? '' : context;
    this.apply = apply_;
    this._str = '';

    // Compatibility stuff, just in case
    var _this = this;
    this._buf = {
        push : function() {
            var chunks = slice.call(arguments).join('');
            _this._str += chunks;
        },
        join : function() {
            return this._str;
        }
    };
    this._ = this;

    // Stub out fields that will be used later
    this._start = true;
    this._mode = '';
    this._listLength = 0;
    this._notNewList = false;
    this.position = 0;
    this.block = undef;
    this.elem = undef;
    this.mods = undef;
    this.elemMods = undef;
}

BEMContext.prototype.isArray = isArray;

BEMContext.prototype.isSimple = function isSimple(obj) {
    if(!obj || obj === true) return true;
    var t = typeof obj;
    return t === 'string' || t === 'number';
};

BEMContext.prototype.isShortTag = function isShortTag(t) {
    return SHORT_TAGS.hasOwnProperty(t);
};

BEMContext.prototype.extend = function extend(o1, o2) {
    if(!o1 || !o2) return o1 || o2;
    var res = {}, n;
    for(n in o1) o1.hasOwnProperty(n) && (res[n] = o1[n]);
    for(n in o2) o2.hasOwnProperty(n) && (res[n] = o2[n]);
    return res;
};

BEMContext.prototype.identify = (function() {
    var cnt = 0,
        id = (+new Date()),
        expando = '__' + id,
        get = function() { return 'uniq' + id + (++cnt); };
    return function(obj, onlyGet) {
        if(!obj) return get();
        if(onlyGet || obj[expando]) {
            return obj[expando];
        } else {
            return (obj[expando] = get());
        }
    };
})();

BEMContext.prototype.xmlEscape = buildEscape('[&<>]');
BEMContext.prototype.attrEscape = buildEscape('["&<>]');

BEMContext.prototype.BEM = BEM_;

BEMContext.prototype.isFirst = function isFirst() {
    return this.position === 1;
};

BEMContext.prototype.isLast = function isLast() {
    return this.position === this._listLength;
};

BEMContext.prototype.generateId = function generateId() {
    return this.identify(this.ctx);
};

// Wrap xjst's apply and export our own
var oldApply = exports.apply;
exports.apply = BEMContext.apply = function BEMContext_apply(context) {
    var ctx = new BEMContext(context || this, oldApply);
    ctx.apply();
    return ctx._str;
};

BEMContext.prototype.reapply = BEMContext.apply;

}); // oninit

match(this._mode === '')(

    match()(function() {
        this.ctx || (this.ctx = {});

        var vBlock = this.ctx.block,
            vElem = this.ctx.elem,
            block = this._currBlock || this.block;

        local('default', {
            block : vBlock || (vElem? block : undefined),
            _currBlock : vBlock || vElem? undefined : block,
            elem : vElem,
            mods : vBlock? this.ctx.mods || (this.ctx.mods = {}) : this.mods,
            elemMods : this.ctx.elemMods || {}
        })(function() {
            (this.block || this.elem)?
                (this.position = (this.position || 0) + 1) :
                this._listLength--;
            apply();
        });
    }),

    match(function() { return this.isArray(this.ctx); })(function() {
        var ctx = this.ctx,
            len = ctx.length,
            i = 0,
            prevPos = this.position,
            prevNotNewList = this._notNewList;

        if(prevNotNewList) {
            this._listLength += len - 1;
        } else {
            this.position = 0;
            this._listLength = len;
        }

        this._notNewList = true;

        while(i < len)
            apply({ ctx : ctx[i++] });

        prevNotNewList || (this.position = prevPos);
    }),

    match(!this.ctx)(function() {
        this._listLength--;
    }),

    match(function() { return this.isSimple(this.ctx); })(function() {
        this._listLength--;

        var ctx = this.ctx;
        if(ctx && ctx !== true || ctx === 0) {
            this._str += ctx + '';
        }
    }),

    // hack-check for Vow-promise
    match(this.ctx && this.ctx._vow)(function() {
        applyCtx(this.ctx._value);
    })

);

def()(function() {
    var BEM_INTERNAL = this.BEM.INTERNAL,
        ctx = this.ctx,
        isBEM,
        tag,
        res;

    local({ _str : '' })(function() {
        var vBlock = this.block;

        tag = apply('tag');
        typeof tag !== 'undefined' || (tag = ctx.tag);
        typeof tag !== 'undefined' || (tag = 'div');

        if(tag) {
            var jsParams, js;
            if(vBlock && ctx.js !== false) {
                js = apply('js');
                js = js? this.extend(ctx.js, js === true? {} : js) : ctx.js === true? {} : ctx.js;
                js && ((jsParams = {})[BEM_INTERNAL.buildClass(vBlock, ctx.elem)] = js);
            }

            this._str += '<' + tag;

            isBEM = apply('bem');
            typeof isBEM !== 'undefined' ||
                (isBEM = typeof ctx.bem !== 'undefined'? ctx.bem : ctx.block || ctx.elem);

            var cls = apply('cls');
            cls || (cls = ctx.cls);

            var addJSInitClass = ctx.block && jsParams;
            if(isBEM || cls) {
                this._str += ' class="';
                if(isBEM) {
                    this._str += BEM_INTERNAL.buildClasses(vBlock, ctx.elem, ctx.elemMods || ctx.mods);

                    var mix = apply('mix');
                    ctx.mix && (mix = mix? [].concat(mix, ctx.mix) : ctx.mix);

                    if(mix) {
                        var visited = {},
                            visitedKey = function(block, elem) {
                                return (block || '') + '__' + (elem || '');
                            };

                        visited[visitedKey(vBlock, this.elem)] = true;

                        // Transform mix to the single-item array if it's not array
                        this.isArray(mix) || (mix = [mix]);
                        for(var i = 0; i < mix.length; i++) {
                            var mixItem = mix[i],
                                hasItem = mixItem.block || mixItem.elem,
                                mixBlock = mixItem.block || mixItem._block || this.block,
                                mixElem = mixItem.elem || mixItem._elem || this.elem;

                            hasItem && (this._str += ' ');

                            this._str += BEM_INTERNAL[hasItem? 'buildClasses' : 'buildModsClasses'](
                                mixBlock,
                                mixItem.elem || mixItem._elem ||
                                    (mixItem.block? undefined : this.elem),
                                mixItem.elemMods || mixItem.mods);

                            if(mixItem.js) {
                                (jsParams ||
                                        (jsParams = {}))[BEM_INTERNAL.buildClass(mixBlock, mixItem.elem)] = mixItem.js === true?
                                    {} :
                                    mixItem.js;
                                addJSInitClass || (addJSInitClass = mixBlock && !mixItem.elem);
                            }

                            // Process nested mixes
                            if(hasItem && !visited[visitedKey(mixBlock, mixElem)]) {
                                visited[visitedKey(mixBlock, mixElem)] = true;
                                var nestedMix = apply('mix', {
                                    block : mixBlock,
                                    elem : mixElem
                                });

                                if(nestedMix) {
                                    for(var j = 0; j < nestedMix.length; j++) {
                                        var nestedItem = nestedMix[j];
                                        if(!nestedItem.block &&
                                                !nestedItem.elem ||
                                                !visited[visitedKey(
                                                    nestedItem.block,
                                                    nestedItem.elem
                                                )]) {
                                            nestedItem._block = mixBlock;
                                            nestedItem._elem = mixElem;
                                            mix.splice(i + 1, 0, nestedItem);
                                        }
                                    }
                                }
                            }
                        }
                    }
                }

                cls && (this._str += isBEM? ' ' + cls : cls);
                this._str += addJSInitClass? ' i-bem"' : '"';
            }

            if(isBEM && jsParams) {
                this._str += ' data-bem="' +
                    this.attrEscape(JSON.stringify(jsParams)) +
                    '"';
            }

            var attrs = apply('attrs');
            // NOTE: maybe we need to make an array for quicker serialization
            attrs = this.extend(attrs, ctx.attrs);
            if(attrs) {
                var name, attr; // TODO: do something with OmetaJS and YUI Compressor
                for(name in attrs) {
                    attr = attrs[name];
                    if(typeof attr === 'undefined') continue;
                    this._str += ' ' + name + '="' +
                        this.attrEscape(this.isSimple(attr)?
                            attr :
                            this.reapply(attr)) +
                        '"';
                }
            }
        }

        if(this.isShortTag(tag)) {
            this._str += '/>';
        } else {
            tag && (this._str += '>');

            var content = apply('content');
            if(content || content === 0) {
                isBEM = vBlock || this.elem;
                apply('', {
                    _notNewList : false,
                    position : isBEM? 1 : this.position,
                    _listLength : isBEM? 1 : this._listLength,
                    ctx : content
                });
            }

            tag && (this._str += '</' + tag + '>');
        }

        // If the buffer was replaced, pretend that we're pushing to the buffer
        res = this._str;
    });

    this._buf.push(res);
});

tag()(undefined);
attrs()(undefined);
cls()(undefined);
js()(undefined);
bem()(undefined);
mix()(undefined);
content()(function() { return this.ctx.content; });

/* end: /Users/direvius/git/tank-show/libs/bem-core/common.blocks/i-bem/i-bem.bemhtml */
/* begin: /Users/direvius/git/tank-show/libs/bem-core/common.blocks/ua/ua.bemhtml */
block('ua')(
    tag()('script'),
    bem()(false),
    content()([
        '(function(e,c){',
            'e[c]=e[c].replace(/(ua_js_)no/g,"$1yes");',
        '})(document.documentElement,"className");'
    ])
);

/* end: /Users/direvius/git/tank-show/libs/bem-core/common.blocks/ua/ua.bemhtml */
/* begin: /Users/direvius/git/tank-show/libs/bem-core/common.blocks/page/__css/page__css.bemhtml */
block('page').elem('css')(
    bem()(false),
    tag()('style'),
    match(function() { return this.ctx.url; })(
        tag()('link'),
        attrs()(function() { return { rel : 'stylesheet', href : this.ctx.url }; })
    )
);

/* end: /Users/direvius/git/tank-show/libs/bem-core/common.blocks/page/__css/page__css.bemhtml */
/* begin: /Users/direvius/git/tank-show/libs/bem-core/desktop.blocks/page/__css/page__css.bemhtml */
block('page').elem('css')(
    def()
        .match(function() { return this.ctx.hasOwnProperty('ie'); })
        .match(function() { return !this.ctx._ieCommented; })(
            function() {
                var ie = this.ctx.ie,
                    hideRule = !ie?
                        ['gt IE 9', '<!-->', '<!--'] :
                        ie === '!IE'?
                            [ie, '<!-->', '<!--'] :
                            [ie, '', ''];
                apply(
                    '',
                    { 'ctx._ieCommented' : true },
                    {
                        ctx : [
                            '<!--[if ' + hideRule[0] + ']>' + hideRule[1],
                            this.ctx,
                            hideRule[2] + '<![endif]-->'
                        ]
                    }
                );
            },
            match(function() { return this.ctx.ie === true; })(function() {
                var url = this.ctx.url;
                applyCtx([6, 7, 8, 9].map(function(v) {
                    return { elem : 'css', url : url + '.ie' + v + '.css', ie : 'IE ' + v };
                }));
            }))
);

/* end: /Users/direvius/git/tank-show/libs/bem-core/desktop.blocks/page/__css/page__css.bemhtml */
/* begin: /Users/direvius/git/tank-show/libs/bem-core/common.blocks/page/__js/page__js.bemhtml */
block('page').elem('js')(
    bem()(false),
    tag()('script'),
    attrs().match(function() { return this.ctx.url; })(function() {
        return { src : this.ctx.url };
    })
);

/* end: /Users/direvius/git/tank-show/libs/bem-core/common.blocks/page/__js/page__js.bemhtml */
/* begin: /Users/direvius/git/tank-show/blocks/chart/chart.bemhtml */
block('chart')(
    content()(function() {
        return this.ctx.items.map(function(item) {
            return {
                block: 'user',
                mods: { active: item.current },
                name: item.user,
                place: item.place,
                points: item.points
            }
        });
    })
);

/* end: /Users/direvius/git/tank-show/blocks/chart/chart.bemhtml */
/* begin: /Users/direvius/git/tank-show/blocks/user/user.bemhtml */
block('user')(
    content()(function() {
        var ctx = this.ctx;

        return [
            {
                elem: 'place',
                content: ctx.place
            },
            {
                elem: 'name',
                content: ctx.name
            },
            {
                elem: 'info',
                points: ctx.points,
                place: ctx.place
            }
        ];
    }),

    elem('info')(
        content()(function() {
            var ctx = this.ctx;

            // generate stars elems
            if(ctx.place && ctx.place <= 3) {
                var levelStars = [];

                for (var i = ctx.place; i <= 3; i++) {
                    levelStars.push({
                        elem: 'level-star',
                        content: '&#9733;'
                    })
                }
            }

            return [
                {
                    elem: 'level',
                    content: levelStars
                },
                {
                    elem: 'points',
                    content: ctx.points
                }
            ]
        })
    )
);

/* end: /Users/direvius/git/tank-show/blocks/user/user.bemhtml */
/* begin: /Users/direvius/git/tank-show/blocks/welcome/welcome.bemhtml */
block('welcome')(
    content()(function() {
        return [
            {
                elem: 'image-wrapper',
                content: {
                    block: 'image',
                    url: '/i/welcome__image.png',
                    mix: { block: 'welcome', elem: 'image' }
                }
            },
            {
                elem: 'text',
                content: [
                    'Здравствуй, ',
                    {
                        elem: 'name',
                        content: this.ctx.name
                    }
                ]
            },
            typeof this.ctx.time !== 'undefined' ? {
                elem: 'time-to-ready',
                content: [
                    {
                        elem: 'time-hour',
                        content: '00:'
                    },
                    {
                        elem: 'time-min',
                        content: this.ctx.time
                    }
                ]
            } : '',
            {
                elem: 'call-to-action',
                content: 'Готовься, cейчас начнется!'
            }
        ]
    })
);

/* end: /Users/direvius/git/tank-show/blocks/welcome/welcome.bemhtml */
/* begin: /Users/direvius/git/tank-show/blocks/welcome/_countdown/welcome_countdown.bemhtml */
block('welcome')(
    mod('countdown', true)(
        js()(function () {
            return {
                time: this.ctx.time
            };
        })
    )
);

/* end: /Users/direvius/git/tank-show/blocks/welcome/_countdown/welcome_countdown.bemhtml */
/* begin: /Users/direvius/git/tank-show/libs/bem-components/common.blocks/image/image.bemhtml */
block('image')(
    tag()('img'),
    attrs()(function() {
        var ctx = this.ctx;
        return {
            src : ctx.url,
            width : ctx.width,
            height : ctx.height,
            alt : ctx.alt,
            title : ctx.title
        };
    })
);

/* end: /Users/direvius/git/tank-show/libs/bem-components/common.blocks/image/image.bemhtml */
/* begin: /Users/direvius/git/tank-show/blocks/shooting/shooting.bemhtml */
block('shooting')(
    content()(function () {
        return [
            {
                elem: 'scores',
                content: this.ctx.scores
            },
            {
                elem: 'timer',
                content: this.ctx.time
            },
            {
                elem: 'bullets'
            }
        ];
    })
);

/* end: /Users/direvius/git/tank-show/blocks/shooting/shooting.bemhtml */
/* begin: /Users/direvius/git/tank-show/blocks/shooting/__bullets/shooting__bullets.bemhtml */
block('shooting').elem('bullets')(
    content()(function () {
        return '<object id="Flash" width="100%" height="100%"><param name="movie" value="/i/shooting__bullets.swf"><param name="quality" value="high"><param name="wmode" value="transparent" /></object>';
    })
);

/* end: /Users/direvius/git/tank-show/blocks/shooting/__bullets/shooting__bullets.bemhtml */
/* begin: /Users/direvius/git/tank-show/libs/bem-core/common.blocks/page/page.bemhtml */
block('page')(

    def().match(function() { return !this._defPageApplied; })(function() {
        this._defPageApplied = true;

        var ctx = this.ctx;
        applyCtx([
            ctx.doctype || '<!DOCTYPE html>',
            {
                tag : 'html',
                cls : 'ua_js_no',
                content : [
                    {
                        elem : 'head',
                        content : [
                            { tag : 'meta', attrs : { charset : 'utf-8' } },
                            { tag : 'title', content : ctx.title },
                            { block : 'ua' },
                            ctx.head,
                            ctx.styles,
                            ctx.favicon? { elem : 'favicon', url : ctx.favicon } : ''
                        ]
                    },
                    ctx
                ]
            }
        ]);

        this._defPageApplied = false;
    }),

    tag()('body'),

    content()(function() {
        return [
            applyNext(),
            this.ctx.scripts
        ];
    }),

    elem('head')(
        bem()(false),
        tag()('head')
    ),

    elem('meta')(
        bem()(false),
        tag()('meta')
    ),

    elem('link')(
        bem()(false),
        tag()('link')
    ),

    elem('favicon')(
        bem()(false),
        tag()('link'),
        attrs()(function() { return { rel : 'shortcut icon', href : this.ctx.url }; })
    )

);

/* end: /Users/direvius/git/tank-show/libs/bem-core/common.blocks/page/page.bemhtml */
/* begin: /Users/direvius/git/tank-show/libs/bem-core/desktop.blocks/page/page.bemhtml */
block('page')(
    elem('head')(
        content()(function() {
            return [
                this.ctx['x-ua-compatible'] === false ?
                    false :
                    {
                        tag : 'meta',
                        attrs : {
                            'http-equiv' : 'X-UA-Compatible',
                            content : this.ctx['x-ua-compatible'] || 'IE=edge'
                        }
                    },
                applyNext()
            ];
        })
    )
);

/* end: /Users/direvius/git/tank-show/libs/bem-core/desktop.blocks/page/page.bemhtml */
/* begin: /Users/direvius/git/tank-show/blocks/page/page.bemhtml */
block('page')(
    js()(true),
    content()(function () {
        return [
            { elem: 'wrap' },
            applyNext()
        ];
    })
);

/* end: /Users/direvius/git/tank-show/blocks/page/page.bemhtml */;
/// -------------------------------------
/// ------ BEM-XJST User-code End -------
/// -------------------------------------
__$flush();
/// -------------------------------------
/// ---------- User code end ------------
/// -------------------------------------
};;
     return exports;
  }
  var defineAsGlobal = true;
  if(typeof exports === "object") {
    exports["BEMHTML"] = __bem_xjst({});
    defineAsGlobal = false;
  }
  if(typeof modules === "object") {
    modules.define("BEMHTML",
      function(provide) {
        provide(__bem_xjst({})) });
    defineAsGlobal = false;
  }
  defineAsGlobal && (g["BEMHTML"] = __bem_xjst({}));
})(this);