const { Observable } = require("rxjs")

module.exports = new Observable((observer) => {
    const nextFrame = () => requestAnimationFrame(() => {
        observer.next()
        nextFrame()
    })

    nextFrame()
})
