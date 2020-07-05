const ffmpeg = require("ffmpeg.js/ffmpeg-mp4")

module.exports = webmData => ffmpeg({
	MEMFS: [{ name: "video.webm", data: Uint8Array.from(webmData) }],
	arguments: ["-i", "video.webm", "-codec", "copy", "-strict", "-2", "output.mp4"]
}).MEMFS[0].data
