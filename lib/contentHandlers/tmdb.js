/*jslint node: true, esversion: 6, maxlen: 180 */
"use strict";

const assert = require('assert');
const Path = require('path');
const Async = require('async');

const debug = require('debug')('upnpserver:contentHandlers:Tmdb');
const logger = require('../logger');

const MetasImages = require('./metas.images');

const TmdbAPI = require('./tmdbAPI');

const tmdbKey = /__tmdb(\d+)[^A-Za-z]/i;

const tmtvKey = /__tmtv(\d+)[^A-Za-z]/i;

class tmdb extends MetasImages {
	constructor(configuration) {
		super(configuration);

		var apiKey = configuration.TMDB_API_KEY || process.env.TMDB_API_KEY;
		if (apiKey) {
			this._tmdbAPI = new TmdbAPI(apiKey, configuration);
		}

		this._basePath = this._basePath || process.env.TMDB_REPOSITORY;
	}

	get name() {
		return "tmdb";
	}

	get domainKey() {
		return "themoviedb.org";
	}

	_getKeyFromFileName(basename) {
		var reg = tmdbKey.exec(basename);
		debug("_getKeyFromFileName", "basename=", basename, " tmdbKey=>", reg);
		if (reg) {
			return {
				key: reg[1],
				type: 'movie'
			};
		}

		reg = tmtvKey.exec(basename);
		debug("_getKeyFromFileName", "basename=", basename, " tmdbKey=>", reg);
		if (reg) {
			return {
				key: reg[1],
				type: 'tvShow'
			};
		}

		return null;
	}

	_getKeyFromDirectoryName(basename) {
		var reg = tmtvKey.exec(basename);
		debug("_getKeyFromDirectoryName", "basename=", basename, " tmdbKey=>", reg);
		if (reg) {
			return {
				key: reg[1],
				type: 'tvShow'
			};
		}

		return null;
	}

	_computeJSONPathInBase(key, fileInfos, callback) {
		debug("_computeJSONPathInBase", "key=", key);

		if (!this._baseURL) {
			return callback();
		}

		var jsonURL = this._baseURL.join(key.type + key.key + ".json");

		debug("_computeJSONPathInBase", "key=", key, "fileInfos=", fileInfos, "=>", jsonURL);

		callback(null, jsonURL, fileInfos);
	}

	_processTvShow(contentInfos, metasContext, jsonContext, fileInfos, callback) {
		var season = fileInfos.season;
		var episode = fileInfos.episode;

		debug("_processTvShow", "Process file", contentInfos.contentURL, "jsonContext=", jsonContext, "season", season, "episode=", episode);

		var json = jsonContext.content;

		var tmdb = json; // ['themoviedb.org'];
		if (tmdb.type !== "tvShow" || !tmdb.tvShow) {
			return callback();
		}

		var tvShow = tmdb.tvShow;

		var seasonJson = (tvShow.seasons || []).find((s) => s.season_number === season);
		debug("_processTvShow", "SeasonJson=", seasonJson);
		if (!seasonJson) {
			return callback();
		}

		var episodeJson = (seasonJson.episodes || []).find((e) => e.episode_number === episode);
		debug("_processTvShow", "EpisodeJson=", episodeJson);
		if (!episodeJson) {
			return callback();
		}

		var metas = {};
		metas.season = episodeJson.season_number;
		metas.episode = episodeJson.episode_number;
		metas.episodeCount = seasonJson.episode_count;

		if (episodeJson.name) {
			metas.title = formatSeasonEpisode(episodeJson.name, season, episode);
			metas.titleAlsoKnownAs = episodeJson.name;
		} else {
			metas.title = formatSeasonEpisode(null, season, episode);
		}
		if (episodeJson.overview) {
			metas.longDescription = episodeJson.overview;
		}
		if (episodeJson.air_date) {
			metas.airDate = episodeJson.air_date;
		}

		var statistics = episodeJson.vote_count;
		if (statistics) {
			metas.ratings = metas.ratings || [];
			metas.ratings.push({
				type: "af_user",
				rating: episodeJson.vote_average / 2  // 5 stars
			});
		}

		var tasks = [];

		var isBaseURL = jsonContext.isBaseURL;
		var resourcesURL;
		if (isBaseURL) {
			resourcesURL = jsonContext.url.join('..');

		} else {
			resourcesURL = jsonContext.url.join('..', this.name);
		}


		if (episodeJson.posters) {
			episodeJson.posters.forEach((poster, idx) => {
				tasks.push((callback) => {
					var posterURL = resourcesURL.join(poster.path);
					debug("_processTvShow", "try posterURL=", posterURL);

					this._addImage(metas, posterURL, poster.path, poster.width, poster.height, "poster", idx, true, isBaseURL, callback);
				});
			});
		}

		if (episodeJson.stills) {
			episodeJson.stills.forEach((poster, idx) => {
				tasks.push((callback) => {
					var ix = idx++;
					var stillURL = resourcesURL.join(poster.path);
					debug("_processTvShow", "try stillURL=", stillURL);

					this._addImage(metas, stillURL, poster.path, poster.width, poster.height, "still", ix, true, isBaseURL, callback);
				});
			});
		}

		if (seasonJson.posters) {
			seasonJson.posters.forEach((poster, idx) => {
				tasks.push((callback) => {
					var posterURL = resourcesURL.join(poster.path);
					debug("_processTvShow", "try season posterURL=", posterURL);

					this._addImage(metas, posterURL, poster.path, poster.width, poster.height, "season-poster", idx, true, isBaseURL, callback);
				});
			});
		}

		if (tvShow.posters) {
			tvShow.posters.forEach((poster, idx) => {
				tasks.push((callback) => {
					var posterURL = resourcesURL.join(poster.path);
					debug("_processTvShow", "try serie posterURL=", posterURL);

					this._addImage(metas, posterURL, poster.path, poster.width, poster.height, "tv-poster", idx, true, isBaseURL, callback);
				});
			});
		}

		Async.series(tasks, (error) => {
			if (error) {
				return callback(error);
			}

			callback(null, metas);
		});
	}

	_processFile(contentInfos, metasContext, jsonContext, fileInfos, callback) {
		debug("_processFile", "Process file", contentInfos.contentURL, "json=", jsonContext, "infos=", fileInfos);
		if (fileInfos.type === "tvShow") {
			this._processTvShow(contentInfos, metasContext, jsonContext, fileInfos, callback);
			return;
		}

		this._processMovie(contentInfos, metasContext, jsonContext, fileInfos, callback);
	}

	_processMovie(contentInfos, metasContext, jsonContext, fileInfos, callback) {
		debug("_processMovie", "Process movie", contentInfos.contentURL, "json=", jsonContext, "fileInfos=", fileInfos);
		var json = jsonContext.content;
		var tmdb = json['themoviedb.org'];
		if (!tmdb || tmdb.type !== "movie" || !tmdb.movieInfo) {
			debug("_processMovie", "No tmdb", tmdb);
			return callback();
		}

		callback();
	}

	_processFolder(contentInfos, metasContext, jsonContext, directoryInfo, callback) {
		debug("_processFolder", "Process folder", contentInfos.contentURL, "json=", jsonContext, "directoryInfo=", directoryInfo);
		var json = jsonContext.content;
		var tmdb = json; // ['themoviedb.org'];
		if (!tmdb || tmdb.type !== "tvShow") {
			debug("_processFolder", "No tmdb", tmdb);
			return callback();
		}

		var tvInfo = tmdb.tvShow;

		if (!tvInfo) {
			// No tmdb infos, download it ?
			debug("_processFolder", "No tmdb key or apiKey", tmdb);
			return callback();
		}

		var metas = {};
		metas.seasons = tvInfo.number_of_seasons;
		metas.episodes = tvInfo.number_of_episodes;

		var genres = tvInfo.genres;
		if (genres) {
			metas.genres = metas.genres || [];

			genres.forEach((genre) => {
				metas.genres.push({
					id: "tmdb_" + genre.id,
					name: genre.name
				});
			});
		}

		var tasks = [];

		var isBaseURL = jsonContext.isBaseURL;
		var resourcesURL;
		if (isBaseURL) {
			resourcesURL = jsonContext.url.join('..');

		} else {
			resourcesURL = jsonContext.url.join('..', this.name);
		}

		if (tvInfo.posters) {
			tvInfo.posters.forEach((poster, idx) => {
				tasks.push((callback) => {
					var posterURL = resourcesURL.join(poster.path);
					debug("_processFolder", "try serie posterURL=", posterURL);

					this._addImage(metas, posterURL, poster.path, poster.width, poster.height, "poster", idx, true, isBaseURL, callback);
				});
			});
		}

		if (tvInfo.backdrops) {
			tvInfo.backdrops.forEach((poster, idx) => {
				tasks.push((callback) => {
					var backdropURL = resourcesURL.join(poster.path);
					debug("_processFolder", "try serie backdropURL=", backdropURL);

					this._addImage(metas, backdropURL, poster.path, poster.width, poster.height, "backdrop", idx, false, isBaseURL, callback);
				});
			});
		}

		Async.series(tasks, (error) => {
			if (error) {
				return callback(error);
			}

			callback(null, metas);
		});
	}

	_loadTmdbImage(url, path, callback) {
		url.stat((error, stats) => {
			debug("_loadTmdbImage", "Stat of url=", url, "stats=", stats, "error=", error);
			if (error) {
				if (error.code === 'ENOENT') {
					// Try to load it !

					if (this._tmdbAPI) {
						this._tmdbAPI.loadImage(url, path, false, callback);
						return;
					}
				}

				return callback(error);
			}

			if (!stats.size && this._tmdbAPI) {
				this._tmdbAPI.loadImage(url, path, false, callback);
				return;
			}

			callback(null, stats);
		});
	}

	_getResourceContentURL(node, type, key, parameters, res, callback) {
		debug("_getResourceContentURL", "node=", node.id, "type=", type, "key=", key, "parameters=", parameters);
		var attributes = node.attributes;

		var resKey = key;
		var idx = 1;

		var reg = /(\d+)/.exec(parameters[idx]);
		if (reg) {
			idx++;

			var pi = parseInt(reg[1], 10);
			resKey = parameters[0] + "/" + pi;

			res = node.attributes.res.find((r) => r.contentHandlerKey === this.name && r.key === resKey);

			debug("_getResourceContentURL", "newResKey=", resKey, "=>", res);
		}

		if (!res || !res.imagePath) {
			return callback("Can not find resource #" + resKey);
		}

		debug("_getResourceContentURL", "Return resource path=", res.imagePath, "key=", key);

		var url;
		if (res.baseURL) {
			url = this._baseURL.join(res.imagePath);

		} else {
			url = this._getBaseDirectoryFromNode(node).join(res.imagePath);
		}

		this._loadTmdbImage(url, res.imagePath, (error, stats) => {
			debug("_getResourceContentURL", "loadTmdbImage url=", url, "stats=", stats, "error=", error);
			if (error || !stats) {
				logger.error(error);
				return callback("Can not find resource #" + resKey);
			}

			if (parameters[idx]) {
				reg = /w(\d+)/.exec(parameters[idx]);
				if (reg) {
					idx++;
					debug("_getResourceContentURL", "param _wX", reg);

					var requestedWidth = parseInt(reg[1], 10);
					var requestedHeight = {
						4096: 4096,
						1024: 768,
						640: 480,
						160: 160
					}[requestedWidth];
					if (!requestedHeight) {
						return callback("Invalid requested size !");
					}

					var r2 = /([^\/]+)\.([^.]+)$/.exec(url.basename);

					debug("_getResourceContentURL", "Split path=", r2);
					if (r2) {
						var sizeSuffix = '_' + requestedWidth + "x" + requestedHeight;

						var url2 = url.changeBasename(r2[1] + sizeSuffix + "." + r2[2]);

						url2.stat((error, stats2) => {
							debug("_getResourceContentURL", "url2=", url2, "error=", error, "stats=", stats2);

							if (stats2 && stats2.size && stats2.mtime.getTime() > stats.mtime.getTime()) {
								callback(null, url2);
								return;
							}

							var sz = null;
							if (res.width) {
								sz = {
									width: res.width,
									height: res.height
								};
							}

							debug("_getResourceContentURL", "url=", url, "Size=", sz, "requestWidth=", requestedWidth, "requestHeight=", requestedHeight);

							this._convertImageSize(null, url, stats, sz, sizeSuffix, requestedWidth, requestedHeight, (error, imageURL, stats, json) => {
								debug("_getResourceContentURL", "Return resized image url=", imageURL, "stats=", stats, "error=", error);
								if (error) {
									return callback(error);
								}

								callback(null, imageURL, stats);
							});
						});
						return;
					}
				}
			}

			callback(null, url, stats);
		});
	}

	_updateInfos(key, type, previousInfos, callback) {
		assert(typeof (callback) === "function", "Invalid callback parameter");
		var api = this._tmdbAPI;
		if (!api) {
			return callback();
		}

		if (type === 'tvShow') {
			api.loadTvShow(key, previousInfos, (error, infos) => {
				callback(error, infos);
			});
			return;
		}

		callback();
	}

	_searchForKey(name, type, callback) {
		assert(typeof (callback) === "function", "Invalid callback parameter");
		var api = this._tmdbAPI;
		if (!api) {
			return callback();
		}

		var ys = name.match(/d+/g);
		if (ys) {
			ys = ys.map(d => parseInt(d, 10)).filter(d => d > 1900);
		}

		var reg = /^([^.]+)/.exec(name);
		if (reg) {
			name = reg[1];
		}

		if (type === 'tvShow') {
			api.searchTvShow(name, ys, (error, key) => {
				callback(error, key);
			});
			return;
		}

		callback();
	}
}

function formatSeasonEpisode(name, season, episode) {
	var s = "";
	if (typeof (season) === "number") {
		s += "S" + ((season < 10) ? "0" : "") + season;
	}
	if (typeof (episode) === "number") {
		s += "E" + ((episode < 10) ? "0" : "") + episode;
	}

	if (name) {
		if (s) {
			s += " ";
		}

		s += name;
	}
	return s;
}

module.exports = tmdb;
