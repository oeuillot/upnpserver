
var watch = require("../lib/util/watch");
var fpath = __dirname;
watch(fpath, {recursive: true}, function(file, event) {
  console.log(file, event);
});
