/**
 * New node file
 */

var DELAY_MS = 500;

function ItemWeakHashmap(delay) {
    delay=delay || DELAY_MS;
    
    var map = {};
    this._map = map;
    this._now = Date.now() + delay;

    var self = this;
    setInterval(function() {
	var now = Date.now();
	self._now = now + delay;
	var count = 0;
	for ( var k in map) {
	    var v = map[k];

	    if (v.date < now) {
		delete map[k];
		count++;
	    }
	}

	if (count) {
	    console.log("################ Remove " + count + " keys");
	}
    }, delay);
}

ItemWeakHashmap.prototype.get = function(item) {
    var value = this._map[item.id];
    if (!value) {
	return value;
    }

    return value.value;
};

ItemWeakHashmap.prototype.put = function(item, value) {
    var v = this._map[item.id];
    if (!v) {
	v = {};
	this._map[item.id] = v;
    }

    v.date = this._now;
    v.value = value;
};

module.exports = ItemWeakHashmap;
