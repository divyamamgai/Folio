// Wrap Source - https://github.com/umdjs/umd/blob/master/templates/jqueryPlugin.js
// Added window and document support. Made undefined alter-secured (not need in ES6).
;(function (factory, undefined) {
    if (typeof define === 'function' && define.amd) {
        define(['jquery'], function ($) {
            factory($, window, document, undefined);
        });
    } else if (typeof module === 'object' && module.exports) {
        module.exports = function (root, jQuery) {
            if (jQuery === undefined) {
                if (typeof window !== 'undefined') {
                    jQuery = require('jquery');
                }
                else {
                    jQuery = require('jquery')(root);
                }
            }
            factory(jQuery, window, document, undefined);
            return jQuery;
        };
    } else {
        factory(jQuery, window, document, undefined);
    }
}(function ($, w, d, undefined) {
    'use strict';
    var defaults = {
            // Keep plugin default options here.
            // Also keep the on-the-fly DOM elements which will be created by the plugin here. For eg. if you plugin uses
            // a container element - <div class="FolioContainer"><!--[More internal elements]--></div>
            // Then should keep it as an object of the defaults if you want to give end user the ability to
            // alter them (Note: It might be dangerous to do so, and documentation should include a warning regarding
            // the consequences of altering the DOM Cache Elements (DOMCE :P).). With this your plugin won't have to
            // create a jQuery DOM element again and again which might costlier, you can use $.fn.clone() method to clone
            // these caches for you plugin instance.
            useHTMLOptions: true,
            infiniteScrolling: false,
            totalPages: 0,
            maxPages: 9,
            activePage: 1,
            nextClass: '',
            previousClass: '',
            onUpdate: $.noop,
            disableInitialOnUpdate: false
        },
        folioCount = 0,
        // Our plugin's constructor function.
        Folio = function (element, options) {
            this.id = ++folioCount;
            /** @type jQuery */
            this.$element = $(element);
            // Note: We don't do -
            // this.properties = defaults;
            // Because we don't want to alter our defaults every time new options are passed and hence we will
            // loose our default options. That's why we take an empty object as target. For every $.extend on
            // this.properties from now on we already have a fresh javascript object to work on.
            // All of the options are available in this.properties and different properties that we might need which are
            // local to this instance are extended in the this.properties object. This encapsulates everything into one
            // manageable javascript object.
            this.properties = $.extend({}, defaults);
            this.setOptions(options);
            if (this.properties.useHTMLOptions) {
                privates.applyHTMLOptions.apply(this);
            }
            this.links = {};
            this.initialize();
        },
        privates = {
            // All of our plugin's private methods go here.
            // Note: They will not have this as an instance of Folio, as a workaround we can do -
            // privates.METHOD_NAME.apply(this);
            // Where this should be an instance of Folio from public methods.
            // Alternatively you can append '_' in front of your methods in Folio.prototype to mark them as private.
            // Note: They will still be available to the End User, it's just a convention.

            // Cache the costly jQuery element creation operation initially and then just clone them when needed.
            $pageCache: $('<span class="FolioPage"></span>'),
            $folioCache: $('<div class="Folio"><span class="FolioControl FolioPrevious"></span><span class="FolioPages"></span><span class="FolioControl FolioNext"></span></div>'),

            // This function extends the plugin instance options with the HTML data attribute based options as -
            // data-OPTION="VALUE" -> OPTION: "VALUE"
            applyHTMLOptions: function () {
                var properties = this.properties,
                    $element = this.$element,
                    htmlOptions = {};
                for (var option in defaults) {
                    if (defaults.hasOwnProperty(option)) {
                        htmlOptions[option] = $element.data(option) || undefined;
                    }
                }
                $.extend(properties, htmlOptions);
                privates.sanitizeOptions.apply(this);
            },

            // Sanitizes the options set by the user. This function is automatically called in
            // privates.applyHTMLOptions() and this.setOptions() functions.
            sanitizeOptions: function () {
                var properties = this.properties;
                // The lower bound for this.properties.maxPages is 5. This is because the tightest possible case is
                // as follows: 1 ... 5 ... 10, which are 5 pages including ellipsis.
                if (properties.maxPages < 5) {
                    properties.maxPages = 5;
                }
                // Sanitize the this.properties.activePage value so that it is valid.
                if (properties.activePage < 1) {
                    properties.activePage = 1;
                }
                if (properties.activePage > properties.totalPages) {
                    properties.activePage = properties.totalPages;
                }
                // Sanitize the this.properties.onUpdate() function, to check if it is a function or not.
                // We do not this every time in this.update() function to remove unnecessary overhead.
                if (!$.isFunction(properties.onUpdate)) {
                    if (typeof properties.onUpdate === 'string') {
                        var onUpdate = w[properties.onUpdate];
                        properties.onUpdate = $.isFunction(onUpdate) ? onUpdate : $.noop;
                    } else {
                        properties.onUpdate = $.noop;
                    }
                }
            }
        };
    // All of our plugin's public methods go here.
    // End user can access these methods as - $element.data('Folio').METHOD_NAME();
    // Note: $.data(element, 'Folio'); is much faster than $element.data('Folio');
    Folio.prototype = {
        /**
         * Creates a new Object from the defaults and extends it with the options Object provided.
         * @param {Object} options - Object of the options to be extended from the defaults.
         * @return {Folio} - Returns the Folio object to maintain chaining.
         */
        setOptions: function (options) {
            this.properties = $.extend(this.properties, options);
            privates.sanitizeOptions.apply(this);
            return this;
        },
        /**
         * Sets the onUpdate() function to be called each time the this.update() function is called. This is just
         * an added utility function, since same can be achieved using this.setOptions() function as used in it.
         * @param {Function} callback - The onUpdate() function to be used.
         * @return {Folio} - Returns the Folio object to maintain chaining.
         */
        onUpdate: function (callback) {
            return this.setOptions({
                onUpdate: callback
            });
        },
        /**
         * Generates the HTML elements of page numbers in the .Folio .FolioPages element corresponding to the maximum
         * elements it can have and store them in a jQuery object array (Note: DOM Elements are mapped to their
         * jQuery objects for faster operations later on.) i.e., this.$pageArray. Initially each element is given
         * numbering from 1 to this.properties.maxPages. Also it clears the .FolioPages elements HTML content before
         * appending page number elements.
         * Note: This function should not be called many times in succession because it is very costly operation and
         * is only automatically called during initialization.
         * @return {Folio} - Returns the Folio object to maintain chaining.
         */
        generate: function () {
            var properties = this.properties,
                totalPages = properties.totalPages,
                maxPages = properties.maxPages,
                // We detach our .FolioPages element first to increase performance while appending elements.
                $pages = this.$pages.detach(),
                $pageCache = privates.$pageCache,
                pageCount = 1;
            $pages.html('');
            if (totalPages >= maxPages) {
                while (pageCount <= maxPages) {
                    $pages.append($pageCache.clone().text(pageCount));
                    pageCount++;
                }
            } else {
                while (pageCount <= totalPages) {
                    $pages.append($pageCache.clone().text(pageCount));
                    pageCount++;
                }
            }
            // Cache the jQuery object equivalent of the children of the .FolioPages to increase performance later.
            this.$pageArray = $pages.children().map(function (index, domElement) {
                return $(domElement);
            });
            // Reattach the .FolioPages element to the .Folio element at the right place.
            $pages.insertBefore(this.$next);
            return this;
        },
        /**
         * Updates the .FolioPages page numbering corresponding to the current activePage. No new element is
         * created and only the numbers(text) of the existing page number elements is updated using the cached
         * .FolioPages .FolioPage jQuery object array i.e., this.$pageArray. Also updates(Either removes or adds
         * the .Disabled class based on the condition.) the next and previous buttons .Disabled class.
         * Note: It also calls the this.properties.onUpdate() function automatically.
         * @param {boolean} [disableOnUpdate] - If true then onUpdate is not called. Default is false.
         * @param {boolean} [disableSync] - If true then synchronisation is not done i.e., setActivePage(activePage)
         * is not called for the linked Folio objects. Default is false.
         * @return {Folio} - Returns the Folio object to maintain chaining.
         */
        update: function (disableOnUpdate, disableSync) {
            var properties = this.properties,
                totalPages = properties.totalPages,
                activePage = properties.activePage,
                maxPages = properties.maxPages,
                pageCount = 1,
                pageIndex = 0,
                links = this.links;
            /** @type jQuery[] */
            var $pageArray = this.$pageArray;

            // Internal function to update page. Since this code required a lot of time it has been encapsulated
            // into a self containing module as it is never needed in the global space.
            function updatePage(index, count) {
                if (activePage === count) {
                    $pageArray[index]
                        .text(count)
                        .removeClass('Ellipsis')
                        .addClass('Active');
                } else {
                    $pageArray[index]
                        .text(count)
                        .removeClass('Ellipsis')
                        .removeClass('Active');
                }
            }

            if (totalPages > maxPages) {
                var leftLastCount = maxPages - 2,
                    rightFirstCount = totalPages - leftLastCount + 1;
                if (activePage < leftLastCount) {
                    for (pageCount = 1; pageCount <= leftLastCount; pageCount++) {
                        updatePage(pageIndex++, pageCount);
                    }
                    $pageArray[pageIndex++]
                    // Unicode for ellipsis character.
                        .html('\u2026')
                        .addClass('Ellipsis')
                        .removeClass('Active');
                    updatePage(pageIndex, totalPages);
                } else if (activePage >= leftLastCount && activePage <= rightFirstCount) {
                    updatePage(pageIndex++, 1);
                    $pageArray[pageIndex++]
                        .html('\u2026')
                        .addClass('Ellipsis')
                        .removeClass('Active');
                    var middlePageCount = maxPages - 4,
                        middleFirstCount = activePage - Math.ceil(middlePageCount / 2) + 1,
                        middleLastCount = middleFirstCount + middlePageCount - 1;
                    for (pageCount = middleFirstCount; pageCount <= middleLastCount; pageCount++) {
                        updatePage(pageIndex++, pageCount);
                    }
                    $pageArray[pageIndex++]
                        .html('\u2026')
                        .addClass('Ellipsis')
                        .removeClass('Active');
                    updatePage(pageIndex, totalPages);
                } else {
                    updatePage(pageIndex++, 1);
                    $pageArray[pageIndex++]
                        .html('\u2026')
                        .addClass('Ellipsis')
                        .removeClass('Active');
                    for (pageCount = rightFirstCount; pageCount <= totalPages; pageCount++) {
                        updatePage(pageIndex++, pageCount);
                    }
                }
            } else {
                for (pageCount = 1; pageCount <= totalPages; pageCount++) {
                    updatePage(pageIndex++, pageCount);
                }
            }
            if (!properties.infiniteScrolling && (activePage === 1)) {
                this.$previous.addClass('Disabled');
            } else {
                this.$previous.removeClass('Disabled');
            }
            if (!properties.infiniteScrolling && (activePage === totalPages)) {
                this.$next.addClass('Disabled');
            } else {
                this.$next.removeClass('Disabled');
            }
            if ((disableOnUpdate || false) === false) {
                properties.onUpdate(activePage);
            }
            if ((disableSync || false) === false) {
                for (var folioID in links) {
                    if (links.hasOwnProperty(folioID)) {
                        links[folioID].setActivePage(activePage, true, true);
                    }
                }
            }
            return this;
        },
        /**
         * Sets the Active Page of the pagination to the given page number and also calls update() function
         * automatically.
         * @param {int} page - Page Number to set the Active Page to.
         * @param {boolean} [disableOnUpdate] - If true then onUpdate is not called. Default is false.
         * @param {boolean} [disableSync] - If true then synchronisation is not done i.e., setActivePage(page)
         * is not called for the linked Folio objects. Default is false.
         * @return {Folio} - Returns the Folio object to maintain chaining.
         */
        setActivePage: function (page, disableOnUpdate, disableSync) {
            var properties = this.properties;
            if ((page >= 1) && (page <= properties.totalPages)) {
                properties.activePage = page;
                this.update((disableOnUpdate || false), (disableSync || false));
            }
            return this;
        },
        /**
         * Increments the active page number. If this.properties.infiniteScrolling is enabled it jumps to 1st page
         * if called when the active page is the last page.
         * @return {Folio} - Returns the Folio object to maintain chaining.
         */
        nextPage: function () {
            var properties = this.properties;
            if (properties.activePage < properties.totalPages) {
                properties.activePage++;
                this.update();
            } else if (properties.infiniteScrolling) {
                properties.activePage = 1;
                this.update();
            }
            return this;
        },
        /**
         * Decrements the active page number. If this.properties.infiniteScrolling is enabled it jumps to last page
         * if called when the active page is the 1st page.
         * @return {Folio} - Returns the Folio object to maintain chaining.
         */
        previousPage: function () {
            var properties = this.properties;
            if (properties.activePage > 1) {
                properties.activePage--;
                this.update();
            } else if (properties.infiniteScrolling) {
                properties.activePage = properties.totalPages;
                this.update();
            }
            return this;
        },
        /**
         * Links this Folio object to the one passed as a parameter. Both the Folios should have equal number of pages.
         * But the max pages can be different. The onUpdate function for all the Folio objects being linked are set
         * to the onUpdate function of this Folio object (one being linked to).
         * @param {Folio} folio - Folio object to link this one with.
         * @param {boolean} [disableBackLinking] - If true then setActivePage(activePage) and link(this) is not called
         * for the linking Folio object. Default is false.
         * @return {Folio} - Returns the Folio object to maintain chaining.
         */
        link: function (folio, disableBackLinking) {
            var properties = this.properties,
                links = this.links;
            if ((folio.properties.totalPages === properties.totalPages) && !links.hasOwnProperty(folio.id)) {
                links[folio.id] = folio;
                folio.properties.onUpdate = properties.onUpdate;
                if ((disableBackLinking || false) === false) {
                    folio.setActivePage(properties.activePage, true);
                    folio.link(this, true);
                }
            }
            return this;
        },
        /**
         * Initializer function for the plugin.
         * @return {Folio} - Returns the Folio object to maintain chaining.
         */
        initialize: function () {
            var $element = this.$element,
                $folio = this.$folio = privates.$folioCache.clone();
            this.$previous = $folio.find('.FolioPrevious').addClass(this.properties.previousClass);
            this.$pages = $folio.find('.FolioPages');
            this.$next = $folio.find('.FolioNext').addClass(this.properties.nextClass);
            $element
                .empty()
                .append($folio);
            this.generate();
            this.update(this.properties.disableInitialOnUpdate);
            return this;
        }
    };
    // Global plugin to alter the defaults, inspiration from here -
    // https://github.com/jquery-boilerplate/jquery-boilerplate/wiki/Handling-plugin-defaults-and-predefinitions
    $.Folio = function (defaultOptions) {
        return $.extend(defaultOptions, defaults);
    };
    // Attach our plugin to jQuery
    $.fn.Folio = function (options) {
        return this.each(function () {
            // Check if the plugin is already attached to this element and whether it is an instance of plugin or not.
            if (!($.data(this, 'Folio') instanceof Folio)) {
                $.data(this, 'Folio', new Folio(this, options));
            }
        });
    };
    /**
     * A plugin extension to retrieve the Folio object attached with the given jQuery object or array of objects.
     * @return {undefined|Folio|jQuery}
     */
    $.fn.GetFolio = function () {
        var folio;
        if (this.length > 1) {
            var folioArray = [];
            this.each(function () {
                folio = $.data(this, 'Folio');
                if ((folio !== undefined) && (folio instanceof Folio)) {
                    folioArray.push(folio);
                }
            });
            return $(folioArray);
        } else if (this.length === 1) {
            folio = $.data(this[0], 'Folio');
            if ((folio !== undefined) && (folio instanceof Folio)) {
                return folio;
            }
        }
    };
    // Make our plugin global by attaching it to the window object.
    w.Folio = Folio;
    // Bind events to Folio pages and controls.
    $(d)
        .on('click', '.FolioPage:not(.Ellipsis)', function () {
            // Our element is the third parent of our current Folio Page element which has a reference to the Folio
            // object stuck to it.
            /** @type Folio */
            var folio = $.data($(this).parent().parent().parent()[0], 'Folio');
            var page = parseInt(this.innerText);
            if (folio.properties.activePage !== page) {
                folio.setActivePage(page);
            }
        })
        .on('click', '.FolioPrevious:not(.Disabled)', function () {
            /** @type Folio */
            var folio = $.data($(this).parent().parent()[0], 'Folio');
            folio.previousPage();
        })
        .on('click', '.FolioNext:not(.Disabled)', function () {
            /** @type Folio */
            var folio = $.data($(this).parent().parent()[0], 'Folio');
            folio.nextPage();
        });
    // Auto apply plugin to the elements with attribute - data-Folio present.
    $(function () {
        $('[data-Folio]', d).Folio();
    });
}));
