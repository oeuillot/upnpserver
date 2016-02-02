/*jslint node: true, esversion: 6 */
"use strict";

const Container = require('./object.container');

class PlaylistContainer extends Container {
  get name() { return PlaylistContainer.UPNP_CLASS; }
}

module.exports = PlaylistContainer;

PlaylistContainer.UPNP_CLASS = Container.UPNP_CLASS + ".playlistContainer";
