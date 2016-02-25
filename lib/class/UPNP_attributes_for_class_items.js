/*jslint node: true, esversion: 6 */
"use strict";

const DIDL_ATTRS = [ 'id', 'res', 'searchable', 'parentID', 'refID',
    'restricted', 'childCount' ];
const DC_ATTRS = [ 'title', 'date', 'creator', 'publisher', 'contributor',
    'relation', 'description', 'rights', 'date', 'language' ];
const UPNP_ATTRS = [ 'class', 'searchClass', 'createClass', 'writeStatus',
    'artist', 'actor', 'author', 'producer', 'director', 'genre', 'album',
    'playlist', 'longDescription', 'icon', 'region', 'rating', 'radioCallSign',
    'radioStationID', 'radioBand', 'channelNr', 'channelName',
    'originalTrackNumber', 'toc' ];

const MUSICTRACK_DC = [ 'date', 'contributor' ];
const MUSICTRACK_UPNP = [ 'artist', 'album', 'originalTrackNumber', 'playlist',
    'storageMedium' ];

const AUDIOITEM_DC = [ 'description', 'publisher', 'language', 'relation',
    'rights' ];
const AUDIOITEM_UPNP = [ 'genre', 'longDescription' ];

const AUDIOBROADCAST_DC = [];
const AUDIOBROADCAST_UPNP = [ 'region', 'radioCallSign', 'radioStationID',
    'radioBand', 'channelNr' ];

const AUDIOBOOK_DC = [ 'date', 'contributor' ];
const AUDIOBOOK_UPNP = [ 'producer', 'storageMedium' ];

const VIDEOITEM_DC = [ 'publisher', 'relation', 'description', 'language' ];
const VIDEOITEM_UPNP = [ 'actor', 'producer', 'director', 'genre',
    'longDescription', 'rating' ];

const MOVIE_DC = [];
const MOVIE_UPNP = [ 'storageMedium', 'DVDRegionCode', 'channelName',
    'scheduledStartTime', 'scheduledEndTime' ];

const VIDEOBRAODCAST_UPNP = [ 'icon', 'region', 'channelNr' ];

const MUSICVIDEOCLIP_UPNP = [ 'artist', 'storageMedium', 'album',
    'scheduledStartTime', 'scheduledEndTime', 'director' ];
const MUSICVIDEOCLIP_DC = [ 'contributor', 'date' ];

const IMAGEITEM_UPNP = [ 'longDescription', 'storageMedium', 'rating' ];
const IMAGEITEM_DC = [ 'description', 'publisher', 'date', 'rights' ];

const PHOTO_UPNP = [ 'album' ];

const PLAYLIST_UPNP = [ 'artist', 'genre', 'longDescription', 'storageMedium' ];
const PLAYLIST_DC = [ 'description', 'date', 'language' ];

const TEXTITEM_UPNP = [ 'author', 'protection', 'longDescription',
    'storageMedium', 'rating' ];
const TEXTITEM_DC = [ 'description', 'publisher', 'contributor', 'date',
    'relation', 'language', 'rights' ];

const ALBUM_UPNP = [ 'storageMedium' ];
const ALBUM_DC = [ 'longDescription', 'description', 'publisher', 'contributor',
    'date', 'relation', 'rights' ];

const MUSICALBUM_UPNP = [ 'artist', 'genre', 'producer', 'albumArtURI', 'toc' ];

const GENRE_UPNP = [ 'longDescription' ];
const GENRE_DC = [ 'description' ];
