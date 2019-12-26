const { parse: parseSrt } = require("subtitle")
const { readFile } = require("fs-extra")

module.exports = async (path) => parseSrt(await readFile(path, "utf8"))
