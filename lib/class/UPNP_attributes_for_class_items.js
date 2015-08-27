var DIDL_ATTRS = [ 'id', 'res', 'searchable', 'parentID', 'refID',
    'restricted', 'childCount' ];
var DC_ATTRS = [ 'title', 'date', 'creator', 'publisher', 'contributor',
    'relation', 'description', 'rights', 'date', 'language' ];
var UPNP_ATTRS = [ 'class', 'searchClass', 'createClass', 'writeStatus',
    'artist', 'actor', 'author', 'producer', 'director', 'genre', 'album',
    'playlist', 'longDescription', 'icon', 'region', 'rating', 'radioCallSign',
    'radioStationID', 'radioBand', 'channelNr', 'channelName',
    'originalTrackNumber', 'toc' ];

var MUSICTRACK_DC = [ 'date', 'contributor' ];
var MUSICTRACK_UPNP = [ 'artist', 'album', 'originalTrackNumber', 'playlist',
    'storageMedium' ];

var AUDIOITEM_DC = [ 'description', 'publisher', 'language', 'relation',
    'rights' ];
var AUDIOITEM_UPNP = [ 'genre', 'longDescription' ];

var AUDIOBROADCAST_DC = [];
var AUDIOBROADCAST_UPNP = [ 'region', 'radioCallSign', 'radioStationID',
    'radioBand', 'channelNr' ];

var AUDIOBOOK_DC = [ 'date', 'contributor' ];
var AUDIOBOOK_UPNP = [ 'producer', 'storageMedium' ];

var VIDEOITEM_DC = [ 'publisher', 'relation', 'description', 'language' ];
var VIDEOITEM_UPNP = [ 'actor', 'producer', 'director', 'genre',
    'longDescription', 'rating' ];

var MOVIE_DC = [];
var MOVIE_UPNP = [ 'storageMedium', 'DVDRegionCode', 'channelName',
    'scheduledStartTime', 'scheduledEndTime' ];

var VIDEOBRAODCAST_UPNP = [ 'icon', 'region', 'channelNr' ];

var MUSICVIDEOCLIP_UPNP = [ 'artist', 'storageMedium', 'album',
    'scheduledStartTime', 'scheduledEndTime', 'director' ];
var MUSICVIDEOCLIP_DC = [ 'contributor', 'date' ];

var IMAGEITEM_UPNP = [ 'longDescription', 'storageMedium', 'rating' ];
var IMAGEITEM_DC = [ 'description', 'publisher', 'date', 'rights' ];

var PHOTO_UPNP = [ 'album' ];

var PLAYLIST_UPNP = [ 'artist', 'genre', 'longDescription', 'storageMedium' ];
var PLAYLIST_DC = [ 'description', 'date', 'language' ];

var TEXTITEM_UPNP = [ 'author', 'protection', 'longDescription',
    'storageMedium', 'rating' ];
var TEXTITEM_DC = [ 'description', 'publisher', 'contributor', 'date',
    'relation', 'language', 'rights' ];

var ALBUM_UPNP = [ 'storageMedium' ];
var ALBUM_DC = [ 'longDescription', 'description', 'publisher', 'contributor',
    'date', 'relation', 'rights' ];

var MUSICALBUM_UPNP = [ 'artist', 'genre', 'producer', 'albumArtURI', 'toc' ];

var GENRE_UPNP = [ 'longDescription' ];
var GENRE_DC = [ 'description' ];
