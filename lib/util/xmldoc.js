// xmldoc source from https://github.com/nfarina/xmldoc

(function() {

  // global on the server, window in the browser
  var sax, root = this;

  if (typeof module !== 'undefined' && module.exports) {
    sax = require('sax');
    root = module.exports;
  } else {
    sax = root.sax;
    if (!sax) // no sax for you!
      throw new Error(
          "Expected sax to be defined. Make sure you're including sax.js before this file.");
  }

  /*
   * XmlElement is our basic building block. Everything is an XmlElement; even XmlDocument behaves like an XmlElement by
   * inheriting its attributes and functions.
   */

  function XmlElement(tag) {
    this.name = tag.name;
    this.attr = tag.attributes || {};
    this.val = "";
    this.uri = tag.uri;
    this.children = [];

    // console.log("Tag=", tag);
  }

  var _splitNameRegExp = /(xmlns)(:[a-z0-9_-]+)?/i;
  // SaxParser handlers

  XmlElement.prototype._openTag = function(tag) {

    var child = new XmlElement(tag);

    // add to our children array
    this.children.push(child);

    // update first/last pointers
    if (!this.firstChild)
      this.firstChild = child;
    this.lastChild = child;

    delegates.unshift(child);

    var xmlns;
    var attrs = tag.attributes;

    // console.log("Attributes="+attrs+"/"+attrs.length);
    if (attrs) {
      for ( var name in attrs) {
        var value = attrs[name];

        var r = _splitNameRegExp.exec(name);

        // console.log("Try attr "+name+"/"+value, r);

        if (!r) {
          continue;
        }
        if (!xmlns) {
          xmlns = {};
          for ( var k in this.namespaceURIs) {
            xmlns[k] = this.namespaceURIs[k];
          }
        }

        xmlns[(r[2] && r[2].slice(1)) || ""] = value.value;
      }

      if (xmlns) {
        // console.log("New namespaces ",xmlns," for "+tag.nodeName);
      }
    }

    child.namespaceURIs = xmlns || this.namespaceURIs;
  };

  XmlElement.prototype._closeTag = function() {
    delegates.shift();
  };

  XmlElement.prototype._text = function(text) {
    if (text)
      this.val += text;
  };

  XmlElement.prototype._cdata = function(cdata) {
    if (cdata)
      this.val += cdata;
  };

  // Useful functions

  XmlElement.prototype.eachChild = function(iterator, context) {
    for (var i = 0, l = this.children.length; i < l; i++) {
      if (iterator.call(context, this.children[i], i, this.children) === false) {
        return;
      }
    }
  };

  XmlElement.prototype.childNamed = function(name, xmlns) {
    for (var i = 0, l = this.children.length; i < l; i++) {
      var child = this.children[i];

      if (xmlns !== undefined) {
        // console.log("Compare "+xmlns+"/"+child.uri);
        if (child.uri !== xmlns) {
          continue;
        }
      }

      if (child.name === name)
        return child;
    }
  };

  XmlElement.prototype.childrenNamed = function(name) {
    var matches = [];

    for (var i = 0, l = this.children.length; i < l; i++)
      if (this.children[i].name === name)
        matches.push(this.children[i]);

    return matches;
  };

  XmlElement.prototype.childWithAttribute = function(name, value) {
    for (var i = 0, l = this.children.length; i < l; i++) {
      var child = this.children[i];
      if ((value && child.attr[name] === value) || (!value && child.attr[name]))
        return child;
    }
  };

  XmlElement.prototype.descendantWithPath = function(path) {
    var descendant = this;
    var components = path.split('.');

    for (var i = 0, l = components.length; i < l; i++)
      if (descendant)
        descendant = descendant.childNamed(components[i]);
      else
        return undefined;

    return descendant;
  };

  XmlElement.prototype.valueWithPath = function(path) {
    var components = path.split('@');
    var descendant = this.descendantWithPath(components[0]);
    if (descendant)
      return components.length > 1 ? descendant.attr[components[1]] : descendant.val;
  };

  // String formatting (for debugging)

  XmlElement.prototype.toString = function() {
    return this.toStringWithIndent("");
  };

  XmlElement.prototype.toStringWithIndent = function(indent) {
    var s = "";
    s += indent + "<" + this.name;

    for ( var name in this.attr)
      s += " " + name + '="' + this.attr[name] + '"';

    var trimVal = this.val.trim();

    if (trimVal.length > 25)
      trimVal = trimVal.substring(0, 25).trim() + "…";

    if (this.children.length) {
      s += ">\n";

      var childIndent = indent + "  ";

      if (trimVal.length)
        s += childIndent + trimVal + "\n";

      for (var i = 0, l = this.children.length; i < l; i++)
        s += this.children[i].toStringWithIndent(childIndent) + "\n";

      s += indent + "</" + this.name + ">";
    } else if (trimVal.length) {
      s += ">" + trimVal + "</" + this.name + ">";
    } else
      s += "/>";

    return s;
  };

  /*
   * XmlDocument is the class we expose to the user; it uses the sax parser to create a hierarchy of XmlElements.
   */

  function XmlDocument(xml) {

    if (!xml) {
      throw new Error("No XML to parse!");
    }

    // console.log("xml=",xml);

    var parser = sax.parser(true, {
      xmlns : true
    }); // strict

    parser.onopentag = function() {
      var top = delegates[0];
      top._openTag.apply(top, arguments);
    };
    parser.onclosetag = function() {
      var top = delegates[0];
      top._closeTag.apply(top, arguments);
    };
    parser.ontext = function() {
      var top = delegates[0];
      top._text.apply(top, arguments);
    };
    parser.oncdata = function() {
      var top = delegates[0];
      top._cdata.apply(top, arguments);
    };

    // We'll use the file-scoped "delegates" var to remember what elements we're currently
    // parsing; they will push and pop off the stack as we get deeper into the XML hierarchy.
    // It's safe to use a global because JS is single-threaded.
    delegates = [ this ];
    this.namespaceURIs = {};

    parser.write(xml);
  }

  // make XmlDocument inherit XmlElement's methods
  extend(XmlDocument.prototype, XmlElement.prototype);

  XmlDocument.prototype._openTag = function(tag) {
    if (typeof this.children === 'undefined') {
      // the first tag we encounter should be the root - we'll "become" the root XmlElement
      XmlElement.call(this, tag);
      return;
    }

    // all other tags will be the root element's children
    XmlElement.prototype._openTag.apply(this, arguments);
  };

  // file-scoped global stack of delegates
  var delegates = null;

  /*
   * Helper functions
   */

  // a relatively standard extend method
  function extend(destination, source) {
    for ( var prop in source)
      if (source.hasOwnProperty(prop))
        destination[prop] = source[prop];
  }

  root.XmlDocument = XmlDocument;

})();