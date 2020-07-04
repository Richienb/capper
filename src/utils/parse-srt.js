const { parse: parseSrt } = require("subtitle")
const { promises: fs } = require("fs")

module.exports = async path => parseSrt(await fs.readFile(path, "utf8"))
