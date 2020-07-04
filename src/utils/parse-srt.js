const { parse: parseSrt } = require("subtitle")
const { promises: fs } = require("fs")

module.exports = async filepath => parseSrt(await fs.readFile(filepath, "utf8"))
