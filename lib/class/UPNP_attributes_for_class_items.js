DIDL_ATTRS = ['id','res','searchable','parentID','refID','restricted','childCount']
DC_ATTRS = ['title','date','creator','publisher','contributor',
'relation','description','rights','date','language']
UPNP_ATTRS = ['class','searchClass','createClass','writeStatus',
'artist','actor','author','producer','director',
'genre','album','playlist','longDescription',
'icon','region','rating',
'radioCallSign','radioStationID','radioBand',
'channelNr','channelName','originalTrackNumber','toc']

MUSICTRACK_DC   = ['date','contributor']
MUSICTRACK_UPNP = ['artist','album','originalTrackNumber','playlist','storageMedium']

AUDIOITEM_DC   = ['description','publisher','language','relation','rights']
AUDIOITEM_UPNP = ['genre','longDescription']

AUDIOBROADCAST_DC   = [];
AUDIOBROADCAST_UPNP = ['region','radioCallSign','radioStationID','radioBand','channelNr'];

AUDIOBOOK_DC   = ['date','contributor'];
AUDIOBOOK_UPNP = ['producer','storageMedium'];

VIDEOITEM_DC   = ['publisher','relation','description','language']
VIDEOITEM_UPNP = ['actor','producer','director','genre','longDescription','rating']

MOVIE_DC   = []
MOVIE_UPNP = ['storageMedium','DVDRegionCode','channelName','scheduledStartTime','scheduledEndTime']

VIDEOBRAODCAST_UPNP = ['icon','region','channelNr']

MUSICVIDEOCLIP_UPNP = ['artist','storageMedium','album','scheduledStartTime','scheduledEndTime','director']
MUSICVIDEOCLIP_DC   = ['contributor','date']

IMAGEITEM_UPNP = ['longDescription','storageMedium','rating']
IMAGEITEM_DC   = ['description','publisher','date','rights']

PHOTO_UPNP = ['album']

PLAYLIST_UPNP = ['artist','genre','longDescription','storageMedium']
PLAYLIST_DC   = ['description','date','language']

TEXTITEM_UPNP = ['author','protection','longDescription','storageMedium','rating']
TEXTITEM_DC   = ['description','publisher','contributor','date','relation','language','rights']

ALBUM_UPNP = ['storageMedium']
ALBUM_DC   = ['longDescription','description','publisher','contributor','date','relation','rights']

MUSICALBUM_UPNP = ['artist','genre','producer','albumArtURI','toc']

GENRE_UPNP = ['longDescription']
GENRE_DC   = ['description']
