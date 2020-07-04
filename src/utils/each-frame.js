const Observable = require("es6-observable")

module.exports = new Observable(observer => {
	const nextFrame = () => requestAnimationFrame(() => {
		observer.next()
		nextFrame()
	})

	nextFrame()
})
