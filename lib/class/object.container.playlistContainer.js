/*jslint node: true, esversion: 6 */
"use strict";

const Container = require('./object.container');

const _UPNP_CLASS = Container.UPNP_CLASS + ".playlistContainer"; 

class PlaylistContainer extends Container {
  get name() { return PlaylistContainer.UPNP_CLASS; }

  static get UPNP_CLASS() {
    return _UPNP_CLASS;
  }
}

module.exports = PlaylistContainer;
