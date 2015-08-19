var assert = require('assert'),
  Api = require('../api');

describe("API", function () {
  var api,
    expectedMusic,
    expectedPictures;

  beforeEach(function () {
    expectedMusic = [
      {
        "repositoryId": "path:/home/user",
        "mountPath": "/",
        "directoryPath": "/home/user",
        "searchClasses": undefined
      },
      {
        "repositoryId": "music:/home/user/music",
        "mountPath": "/Music",
        "directoryPath": "/home/user/music"
      }
    ];

    expectedPictures = [
      {
        "repositoryId": "path:/home/user",
        "mountPath": "/",
        "directoryPath": "/home/user",
        "searchClasses": undefined
      },
      {
        "repositoryId": "path:/home/user/pictures",
        "mountPath": "/Pictures",
        "directoryPath": "/home/user/pictures",
        "searchClasses": undefined
      }
    ];

    api = new Api({}, "/home/user");
  });

  it("Path as string should be valid", function () {
    api.initPaths("/home/user/pictures");
    expectedPictures[1].mountPath = "/";

    assert.deepEqual(api.directories, expectedPictures);
  });

  it("Path as object should be valid", function () {
    api.initPaths({
      path: "/home/user/music",
      mountPoint: "/Music",
      type: "music"
    });

    assert.deepEqual(api.directories, expectedMusic);
  });

  it("Should add directory", function () {
    api.addDirectory("/Pictures", "/home/user/pictures");

    assert.deepEqual(api.directories, expectedPictures);
  });

  it("Should add music directory", function () {
    api.addMusicDirectory("/Music", "/home/user/music");

    assert.deepEqual(api.directories, expectedMusic);
  });
});
