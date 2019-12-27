const { remote: electron } = require("electron")
const path = require("path")
const Sentry = require("@sentry/electron")
Sentry.init({ dsn: "https://be5edffe19ef4496b415f7f07eecab65@sentry.io/1866073" })
const _ = require("lodash")
const { Observable } = require("rxjs")
const arrayMove = require("array-move")
const mdc = require("material-components-web")
const saveFile = require("save-file")

const eachFrame = require("./utils/each-frame")
const parseSrt = require("./utils/parse-srt")

const calculateWidth = (resolution) => resolution / 9 * 16

window.addEventListener("load", async () => {
    const $ = require("jquery")

    mdc.autoInit()

    require("./fabric")

    // User-provided options
    const opts = {
        fps: 60,
        resolution: 1080,
        format: "video/webm",
        image: null,
        audio: null,
        subtitles: null,
        name: null,
    }

    // Set canvas size
    $("canvas").attr({
        height: 1080,
        width: calculateWidth(opts.resolution),
    })

    // Handle file inputs
    function fileInput(name) {
        const element = `.opts__${name}`
        $(element).on("click", () => $(`${element}-sel`).click())
        $(`${element}-sel`).on("change", () => {
            opts[name] = $(`${element}-sel`).get(0).files[0].path

            validateOptions()
        })
    }

    // Validate options
    function validateOptions() {
        const disabled = !(opts.image && opts.audio && opts.subtitles && opts.name)
        $(".opts__play").prop("disabled", disabled)
        $(".opts__record").prop("disabled", disabled)
    }

    // File input for audio
    fileInput("audio")

    // File input for image
    fileInput("image")

    // File input for subtitles
    fileInput("subtitles")

    // Text input for name
    $(".opts__name").get(0).MDCTextField.listen("input", () => {
        opts.name = $(".opts__name").get(0).MDCTextField.value
        validateOptions()
    })

    // Play
    $(".opts__play").on("click", () => {
        play()
    })

    // Record
    $(".opts__record").on("click", () => {
        record()
    })

    // Audio object
    const audio = new Audio()

    // Get package version
    const version = electron.app.getVersion()

    // `rem` support
    const rem = (rem) => rem * parseFloat(getComputedStyle(document.documentElement).fontSize)

    // Fabric object
    const canvas = new fabric.StaticCanvas(document.querySelector("canvas"), { backgroundColor: "black" })

    // Common options for animation
    const animateOpts = {
        duration: 200,
        onChange: canvas.renderAll.bind(canvas),
        easing: fabric.util.ease.easeInOutCubic,
    }

    async function play() {
        // Clear the canvas
        canvas.clear()

        // Reset the background colour
        canvas.backgroundColor = "black"

        // Image
        fabric.Image.fromURL(opts.image, (img) => {
            img.scaleToWidth(canvas.width / 5) // 256px (720p)
            img.left = canvas.width / 10 // 128px
            canvas.add(img)
            img.centerV()
        })

        // Progress bar background
        canvas.add(new fabric.Rect({
            width: canvas.width - rem(3), height: rem(0.5),
            left: rem(1.5), top: canvas.height - rem(2),
            fill: "grey",
        }))

        // Progress bar foreground
        const progress = new fabric.Rect({
            width: 0, height: rem(0.5),
            left: rem(1.5), top: canvas.height - rem(2),
            fill: "#f44336",
        })
        canvas.add(progress)

        // Parse subtitle file
        const subtitles = await parseSrt(opts.subtitles)

        // Play audio
        audio.src = opts.audio
        await audio.play()

        // Subtitle subs
        const stubs = []

        // Stub height
        const stubHeight = rem(0.8)

        // Displayed subtitles
        const subs = new Array(3)

        // Add stubs
        subtitles.forEach(({ start }) => {
            // Create & add stub
            const stub = new fabric.Rect({
                width: rem(0.15), height: stubHeight,
                left: (Number(start) / 1000 / audio.duration * (canvas.width - rem(3))) + rem(1.5), top: canvas.height - stubHeight - rem(1.35),
                fill: "white",
                opacity: 0.6,
            })
            canvas.add(stub)
            stubs.push(stub)
        })

        // Title
        const title = [
            new fabric.Text(`${opts.name} - Lyrics`, {
                fontFamily: "Roboto Medium",
                fill: "white",
                fontSize: rem(3),
                left: canvas.width / 3,
                top: canvas.width / 4,
            }),
            new fabric.Text(`Powered by Richienb/capper v${version}`, {
                fontFamily: "Roboto",
                fill: "rgba(255, 255, 255, 0.8)",
                fontSize: rem(2),
                left: canvas.width / 3,
                top: (canvas.width / 4) + rem(4),
            }),
        ]
        title.forEach((obj) => canvas.add(obj))

        // For each fire of requestAnimationFrame
        eachFrame.subscribe(() => {
            // Update the width of the progress bar foreground
            progress.set("width", audio.currentTime / audio.duration * (canvas.width - rem(3)))

            // Re-render all dirty objects
            canvas.renderAll()
        })

        // Spacing between subtitles
        const subSpacing = rem(5.5)

        // Watch for each subtitle change
        new Observable((observer) => {
            // Current subtitle
            let currentSubtitle = {}

            eachFrame.subscribe(() => {
                // Complete observer if finished playing
                if (audio.currentTime === audio.duration) observer.complete()

                // Get current time as milliseconds
                const currentTime = audio.currentTime * 1000

                subtitles.forEach((subtitle, i) => {
                    const { start, end, text } = subtitle

                    // If current subtitle
                    if (currentTime > start && (subtitles[i + 1] ? currentTime < subtitles[i + 1].start : currentTime < end) && !_.isEqual(currentSubtitle, subtitle)) {
                        // Save subtitle
                        currentSubtitle = subtitle

                        // Trigger observer
                        observer.next({
                            previous: subtitles[i - 1] ? subtitles[i - 1].text : null,
                            current: text,
                            next: subtitles[i + 1] ? subtitles[i + 1].text : null,
                            i,
                        })
                    }
                })
            })
        }).subscribe(({ previous, current, next, i }) => {
            // Remove invisible elements
            canvas.getObjects().forEach((obj) => (obj.get("opacity") === 0 ? canvas.remove(obj) : ""))

            // Increase size and brightness for active stub
            stubs[i].animate("opacity", 1, animateOpts)
            stubs[i].animate("height", stubHeight * 1.5, animateOpts)
            stubs[i].animate("top", canvas.height - rem(2.35), animateOpts)

            // Fade out the title when the current subtitle starts
            if (_.isNull(previous)) {
                title.forEach((obj) => obj.animate("opacity", "0", animateOpts))

                // Current subtitle
                subs[1] = new fabric.Text(current, {
                    fontFamily: "Roboto Medium",
                    fill: "white",
                    fontSize: rem(3),
                    left: canvas.width / 3,
                    opacity: 0,
                })
                canvas.add(subs[1])
                subs[1].centerV()

                // Next subtitle
                subs[2] = new fabric.Text(next, {
                    fontFamily: "Roboto",
                    fill: "white",
                    fontSize: rem(2.5),
                    left: canvas.width / 3,
                    opacity: 0,
                })
                canvas.add(subs[2])
                subs[2].centerV()
                subs[2].set("top", subs[2].get("top") + subSpacing)

                // Add subtitles
                subs[1].animate("opacity", "1", animateOpts)

                subs[2].animate("opacity", "0.8", animateOpts)
            } else {
                // Revert previous stub
                stubs[i - 1].animate("opacity", 0.8, animateOpts)
                stubs[i - 1].animate("height", stubHeight, animateOpts)
                stubs[i - 1].animate("top", canvas.height - stubHeight - rem(1.35), animateOpts)

                // Previous subtitle -> Removed
                if (!_.isUndefined(subs[0])) {
                    subs[0].animate("opacity", "0", animateOpts)
                    subs[0].animate("top", `-=${subSpacing}`, animateOpts)
                }

                // Current subtitle -> Previous subtitle
                subs[1].animate("opacity", "0.8", animateOpts)
                subs[1].animate("fontSize", rem(2.5), animateOpts)
                subs[1].animate("top", `-=${subSpacing}`, animateOpts)
                subs[1].set("fontFamily", "Roboto")
                arrayMove.mutate(subs, 1, 0)

                // Next subtitle -> Current subtitle
                subs[2].animate("opacity", "1", animateOpts)
                subs[2].animate("fontSize", rem(3), animateOpts)
                subs[2].animate("top", `-=${subSpacing}`, animateOpts)
                subs[2].set("fontFamily", "Roboto Medium")
                arrayMove.mutate(subs, 2, 1)

                // None -> Next subtitle
                if (!_.isNull(next)) {
                    subs[2] = new fabric.Text(next, {
                        fontFamily: "Roboto",
                        fill: "white",
                        fontSize: rem(2.5),
                        left: canvas.width / 3,
                        opacity: 0,
                    })
                    canvas.add(subs[2])
                    subs[2].centerV()
                    subs[2].set("top", subs[2].get("top") + (subSpacing * 2))

                    subs[2].animate("opacity", "0.8", animateOpts)
                    subs[2].animate("top", `-=${subSpacing}`, animateOpts)
                }
            }

            // Re-render all dirty objects
            canvas.renderAll()
        })
    }

    async function record() {
        // Disable settings
        $(".opts button").prop("disabled", true)
        $(".opts__name").get(0).MDCTextField.disabled = true

        // Configure options
        const options = { mimeType: opts.format }
        const recordedBlobs = []

        // Starting playing
        await play()

        // Prepare recorder
        const sources = [audio.captureStream(), document.querySelector("canvas").captureStream()]
        const streams = new MediaStream([...sources[1].getVideoTracks(), ...sources[0].getAudioTracks()])
        const mediaRecorder = new MediaRecorder(streams, options)

        // Start recordings
        mediaRecorder.start()

        // When recording is stopped
        mediaRecorder.onstop = async () => {
            // Create blob of video file
            const superBuffer = new Blob(recordedBlobs, { type: options.mimeType })

            // Get file save location
            const { filePath: filename } = await electron.dialog.showSaveDialog(electron.getCurrentWindow(), {
                title: "Choose save location",

                defaultPath: path.join(electron.app.getPath("videos"), `${opts.name}.webm`),

                buttonLabel: "Save",

                filters: [
                    { name: "WebM Videos", extensions: ["webm"] },
                    { name: "All Files", extensions: ["*"] },
                ],
            })

            // Save the blob to a file
            await saveFile(await superBuffer.arrayBuffer(), filename)

            // Re-enable settings
            $(".opts button").prop("disabled", false)
            $(".opts__name").get(0).MDCTextField.disabled = false
        }

        // When data enabled
        mediaRecorder.ondataavailable = ({ data }) => {
            // If data exists
            if (data && data.size > 0) {
                // Push the data to an array
                recordedBlobs.push(data)
            }
        }

        // When the audio ends
        audio.addEventListener("ended", () => {
            // Stop the recording
            mediaRecorder.stop()
        })
    }
})
