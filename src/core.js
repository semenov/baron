(function(window, undefined) {
    'use strict';

    if (!window) return; // Server side

var
    scrolls = [],
    _baron = window.baron, // Stored baron vaule for noConflict usage
    $ = window.jQuery, // Trying to use jQuery
    origin = {
        v: { // Vertical
            x: 'Y', pos: 'top', crossPos: 'left', size: 'height', crossSize: 'width',
            client: 'clientHeight', crossClient: 'clientWidth', offset: 'offsetHeight', crossOffset: 'offsetWidth', offsetPos: 'offsetTop',
            scroll: 'scrollTop', scrollSize: 'scrollHeight'
        },
        h: { // Horizontal
            x: 'X', pos: 'left', crossPos: 'top', size: 'width', crossSize: 'height',
            client: 'clientWidth', crossClient: 'clientHeight', offset: 'offsetWidth', crossOffset: 'offsetHeight', offsetPos: 'offsetLeft',
            scroll: 'scrollLeft', scrollSize: 'scrollWidth'
        }
    },

    each = function(obj, iterator) {
        var i = 0;

        if (obj.length === undefined) obj = [obj];

        while (obj[i]) {
            iterator.call(this, obj[i], i);
            i++;
        }
    },

    baron = function(params) { // this - window or jQuery instance
        var jQueryMode = (this && this[0] && this[0].nodeType),
            roots,
            $;

        params = params || {};
        $ = params.$ || window.jQuery;

        if (jQueryMode) {
            params.root = roots = this;
        } else {
            roots = $(params.root || params.scroller);
        }

        return new baron.fn.constructor(roots, params, $);
    };

    baron.fn = {
        constructor: function(roots, input, $) {
            var params = validate(input);

            params.$ = $;    
            each.call(this, roots, function(root, i) {
                var localParams = clone(params);

                if (params.root && params.scroller) {
                    localParams.scroller = params.$(params.scroller, root);
                }

                if (!params.root && params.scroller) {
                    localParams.scroller = params.$(params.scroller);
                }

                if (!params.root && !params.scroller) {
                    localParams.scroller = root;
                }

                if (params.root && !params.scroller) {
                    localParams.scroller = root;
                }

                localParams.root = root;
                this[i] = init(localParams);
                this.length = i + 1;
            });

            this.params = params;
        },

        update: function() {
            var i = 0;
            while (this[i]) this[i++].update();
        },

        baron: function(params) {
            params.root = [];
            params.scroller = this.params.scroller;

            each.call(this, this, function(elem) {
                params.root.push(elem.root);
            });
            params.direction = (this.params.direction == 'v') ? 'h' : 'v';

            return baron(params);
        }
    };

    function init(params) {
        if (params.root.getAttribute('data-baron-' + params.direction)) return;

        var out = new item.prototype.constructor(params); // __proto__ of returning object is baron.prototype

        params.event(out.scroller, 'scroll', function(e) {
            out.scroll(e);
        });

        if (out.bar) {
            params.event(out.bar, 'touchstart mousedown', function(e) { // Bar drag
                e.preventDefault(); // Text selection disabling in Opera... and all other browsers?
                out.selection(); // Disable text selection in ie8
                out.drag.now = 1; // Save private byte
            });
        }

        params.event(document, 'mouseup blur touchend', function() { // Cancelling drag when mouse key goes up and when window loose its focus
            out.selection(1); // Enable text selection
            out.drag.now = 0;
        });

        // Starting drag when mouse key (LM) goes down at bar
        params.event(document, 'touchstart mousedown', function(e) { // document, not window, for ie8
            if (e.button != 2) { // Not RM
                out._pos0(e);
            }
        });

        params.event(document, 'mousemove touchmove', function(e) { // document, not window, for ie8
            if (out.drag.now) {
                out.drag(e);
            }
        });

        params.event(window, 'resize', function() {
            out.update();
        });

        params.event(out.root, 'sizeChange', function() {
            out.update();
        }); // Custon event for alternate baron update mechanism

        params.root.setAttribute('data-baron-' + params.direction, 'inited');

        out.update();

        return out;
    };

    function clone(input) {
        var output = {};

        input = input || {};

        for (var key in input) {
            if (input.hasOwnProperty(key)) {
                output[key] = input[key];
            }
        }

        return output;
    };

    function validate(input) {
        var output = clone(input);

        output.direction = output.direction || 'v';

        var event = input.event || function(elem, event, func, mode) {
            output.$(elem)[mode || 'on'](event, func);
        };

        output.event = function(elems, e, func, mode) {
            each(elems, function(elem) {
                event(elem, e, func, mode);
            });
        };

        return output;
    };

    function fire(eventName) {
        if (this.events && this.events[eventName]) {
            for (var i = 0 ; i < this.events[eventName].length ; i++) {
                this.events[eventName][i].apply(this, Array.prototype.slice.call( arguments, 1 ));
            }
        }
    };

    var item = {};

    item.prototype = {
        constructor: function(params) {
            var $,
                barPos,
                scrollerPos0,
                track,
                resizePauseTimer,
                scrollPauseTimer,
                pause,
                scrollLastFire = new Date().getTime(),
                resizeLastFire = scrollLastFire;

            $ = this.$ = params.$;
            this.event = params.event;
            this.events = {};

            function getNode(sel, context) {
                return $(sel, context)[0]; // Can be undefined
            };

            // DOM elements
            this.root = params.root; // Always html node, not just selector
            this.scroller = getNode(params.scroller); // (params.scroller) ? getNode(params.scroller, this.root) : this.root;
            this.bar = getNode(params.bar, this.root);
            track = this.track = getNode(params.track, this.root);
            if (!this.track && this.bar) {
                track = this.bar.parentNode;
            }
            this.clipper = this.scroller.parentNode;

            // Parameters
            this.direction = params.direction;
            this.origin = origin[this.direction];
            this.barOnCls = params.barOnCls;
            this.barTopLimit = 0;
            pause = params.pause * 1000 || 0;

            // Updating height or width of bar
            function setBarSize(size) {
                var barMinSize = this.barMinSize || 20;

                if (size > 0 && size < this.barMinSize) {
                    size = this.barMinSize;
                }

                if (this.bar) {
                    $(this.bar).css(this.origin.size, parseInt(size) + 'px');
                }
            };

            // Updating top or left bar position
            function posBar(pos) {
                if (this.bar) {
                    $(this.bar).css(this.origin.pos, +pos + 'px');
                }
            };

            // Free path for bar
            function k() {
                return track[this.origin.client] - this.barTopLimit - this.bar[this.origin.offset];
            };

            // Relative content top position to bar top position
            function relToPos(r) {
                return r * k.call(this) + this.barTopLimit;
            };

            // Bar position to relative content position
            function posToRel(t) {
                return (t - this.barTopLimit) / k.call(this);
            };

            // Cursor position in main direction in px // Now with iOs support
            this.cursor = function(e) {
                return e['client' + this.origin.x] || (((e.originalEvent || e).touches || {})[0] || {})['page' + this.origin.x];
            };

            // Text selection pos preventing
            function dontPosSelect() {
                return false;
            };

            this.pos = function(x) { // Absolute scroller position in px
                var ie = 'page' + this.origin.x + 'Offset',
                    key = (this.scroller[ie]) ? ie : this.origin.scroll;

                if (x !== undefined) this.scroller[key] = x;

                return this.scroller[key];
            };

            this.rpos = function(r) { // Relative scroller position (0..1)
                var free = this.scroller[this.origin.scrollSize] - this.scroller[this.origin.client],
                    x;

                if (r) x = this.pos(r * free);
                else x = this.pos();

                return x / (free || 1);
            };

            // Switch on the bar by adding user-defined CSS classname to scroller
            this.barOn = function() {
                if (this.barOnCls) {
                    if (this.scroller[this.origin.client] < this.scroller[this.origin.scrollSize]) {
                        $(this.root).addClass(this.barOnCls);
                    } else {
                        $(this.root).removeClass(this.barOnCls);
                    }
                }
            };

            this._pos0 = function(e) {
                scrollerPos0 = this.cursor(e) - barPos;
            };

            this.drag = function(e) {
                this.scroller[this.origin.scroll] = posToRel.call(this, this.cursor(e) - scrollerPos0) * (this.scroller[this.origin.scrollSize] - this.scroller[this.origin.client]);
            };

            // Text selection preventing on drag
            this.selection = function(enable) {
                this.event(document, 'selectpos selectstart', dontPosSelect, enable ? 'off' : 'on');
            };

            // onResize & DOM modified handler
            this.resize = function() {
                var self = this,
                    delay = 0;

                if (new Date().getTime() - resizeLastFire < pause) {
                    clearTimeout(resizePauseTimer);
                    delay = pause;
                }

                resizePauseTimer = setTimeout(function() {
                    var delta = self.scroller[self.origin.crossOffset] - self.scroller[self.origin.crossClient];

                    if (params.freeze && !self.clipper.style[self.origin.crossSize]) { // Sould fire only once
                        $(self.clipper).css(self.origin.crossSize, self.clipper[self.origin.crossClient] - delta + 'px');
                    }
                    $(self.scroller).css(self.origin.crossSize, self.clipper[self.origin.crossClient] + delta + 'px');
                    
                    Array.prototype.unshift.call( arguments, 'resize' );
                    fire.apply(self, arguments);

                    resizeLastFire = new Date().getTime();
                }, delay);
            }

            // onScroll handler
            this.scroll = function(e) {
                var scrollDelta, oldBarSize, newBarSize,
                    delay = 0,
                    self = this;

                if (new Date().getTime() - scrollLastFire < pause) {
                    clearTimeout(scrollPauseTimer);
                    delay = pause;
                }

                scrollPauseTimer = setTimeout(function() {
                    if (self.bar) {
                        newBarSize = (track[self.origin.client] - self.barTopLimit) * self.scroller[self.origin.client] / self.scroller[self.origin.scrollSize];

                        // Positioning bar
                        if (oldBarSize != newBarSize) {
                            setBarSize.call(self, newBarSize);
                            oldBarSize = newBarSize;
                        }
                        
                        barPos = relToPos.call(self, self.rpos());

                        posBar.call(self, barPos);
                    }

                    Array.prototype.unshift.call( arguments, 'scroll' );
                    fire.apply(self, arguments);

                    scrollLastFire = new Date().getTime();
                }, delay);
            }

            return this;
        },

        update: function() {
            this.resize(1);
            this.barOn();
            this.scroll();

            return this;
        },

        on: function(eventName, func, arg) {
            var names = eventName.split(' ');

            for (var i = 0 ; i < names.length ; i++) {
                if (names[i] == 'init') {
                    func.call(this, arg);
                } else {
                    this.events[names[i]] = this.events[names[i]] || [];

                    this.events[names[i]].push(function() {
                        func.call(this, arg);
                    });
                }
            }
        }
    };

    baron.fn.constructor.prototype = baron.fn;
    item.prototype.constructor.prototype = item.prototype;

    // Use when you need "baron" global var for another purposes
    baron.noConflict = function() {
        window.baron = _baron; // Restoring original value of "baron" global var

        return baron;
    };

    baron.version = '0.6.1';

    if ($ && $.fn) { // Adding baron to jQuery as plugin
        $.fn.baron = baron;
    }
    window.baron = baron; // Use noConflict method if you need window.baron var for another purposes
    if (window['module'] && module.exports) {
        module.exports = baron.noConflict();
    }
})(window);