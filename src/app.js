const Sentry = require("@sentry/electron")
Sentry.init({ dsn: "https://be5edffe19ef4496b415f7f07eecab65@sentry.io/1866073" })
const { remote: electron } = require("electron")
const path = require("path")
const { promises: fs } = require("fs")
const { mutate: moveArrayItem } = require("array-move")
const { fn: pCancelable } = require("p-cancelable")
const pify = require("pify")
const pEachSeries = require("p-each-series")
const delay = require("delay")
const { parse: parseSrt } = require("subtitle")
const mdc = require("material-components-web")
const $ = require("cash-dom")
const webmToMp4 = require("webm-to-mp4")
const eachFrame = require("./utils/each-frame")

const calculateWidth = resolution => resolution / 9 * 16
const calculateHeight = resolution => resolution * 9 / 16

// Get package version
const version = electron.app.getVersion()

window.addEventListener("load", async () => {
	mdc.autoInit()

	require("./fabric")

	fabric.Object.prototype.set({
		strokeWidth: 0
	})

	const imageFromUrl = pify(fabric.Image.fromURL, { errorFirst: false }).bind(fabric.Image.fromURL)
	const roundedCorners = (fabricObject, cornerRadius) => new fabric.Rect({
		width: fabricObject.width,
		height: fabricObject.height,
		rx: cornerRadius / fabricObject.scaleX,
		ry: cornerRadius / fabricObject.scaleY,
		left: -fabricObject.width / 2,
		top: -fabricObject.height / 2
	})

	// User-provided options
	const options_ = {
		fps: 60,
		resolution: 1080,
		format: "video/webm",
		image: undefined,
		audio: undefined,
		subtitles: undefined,
		name: undefined,
		artist: undefined
	}

	const fontFamily = {
		normal: "Poppins",
		medium: "Poppins Medium"
	}

	// Set canvas size
	$(".renderer").attr({
		height: 1080,
		width: calculateWidth(options_.resolution)
	})
	$(".viewable").attr({
		height: calculateHeight(window.innerWidth),
		width: window.innerWidth
	})

	$(window).on("resize", () => {
		$(".viewable").attr({
			height: calculateHeight(window.innerWidth),
			width: window.innerWidth
		})
	})

	// Handle file inputs
	function fileInput(name) {
		const element = `.options__${name}`
		$(element).on("click", () => $(`${element}-select`).trigger("click"))
		$(`${element}-select`).on("change", () => {
			const file = $(`${element}-select`).get(0).files[0]
			if (file) {
				options_[name] = file.path

				toggleButtonEnabled()
			}
		})
	}

	// Validate options
	function toggleButtonEnabled() {
		const disabled = !(options_.image && options_.audio && options_.subtitles && options_.name)
		$(".options__play").prop("disabled", disabled)
		$(".options__record").prop("disabled", disabled)
	}

	// File input for audio
	fileInput("audio")

	// File input for image
	fileInput("image")

	// File input for subtitles
	fileInput("subtitles")

	// Text input for name
	$(".options__name").get(0).MDCTextField.listen("input", () => {
		options_.name = $(".options__name").get(0).MDCTextField.value
		toggleButtonEnabled()
	})

	// Text input for artist
	$(".options__artist").get(0).MDCTextField.listen("input", () => {
		options_.artist = $(".options__artist").get(0).MDCTextField.value
		toggleButtonEnabled()
	})

	// Play
	$(".options__play").on("click", () => {
		play()
	})

	// Record
	$(".options__record").on("click", () => {
		record()
	})

	// Audio object
	const audio = new Audio()

	// `rem` support
	const rem = (rem, fontSize = parseFloat(getComputedStyle(document.documentElement).fontSize)) => rem * fontSize

	// Fabric object
	const canvas = new fabric.StaticCanvas(document.querySelector(".renderer"), { backgroundColor: "black" })

	// Common options for animation
	const animationOptions = {
		duration: 200,
		easing: fabric.util.ease.easeInOutCubic
	}

	const renderer = document.querySelector(".renderer")
	const viewable = document.querySelector(".viewable")

	let progress

	eachFrame.subscribe(() => {
		// If a progress bar exists
		if (progress) {
			// Update the width of the progress bar foreground
			progress.set("width", audio.currentTime / audio.duration * (canvas.width - rem(3)))
		}

		// Re-render all dirty objects
		canvas.renderAll()

		// Render the canvas
		viewable.getContext("2d").drawImage(renderer, 0, 0, renderer.width, renderer.height, 0, 0, viewable.width, viewable.height)
	})

	let subtitleRenderer

	async function play() {
		// Cancel the rendering of currently playing subtitles and progress bar updating
		// TODO: Use optional chaining when Electron supports Node.js 14
		if (subtitleRenderer) {
			subtitleRenderer.cancel()
		}

		// Clear the canvas
		canvas.clear()

		// Reset the background colour
		canvas.backgroundColor = "black"

		// Image
		const albumImage = await imageFromUrl(options_.image)

		albumImage.scaleToWidth(canvas.width / 5) // 256px (720p)
		canvas.add(albumImage)
		albumImage.centerV()
		albumImage.set({
			left: canvas.width / 10, // 128px
			clipPath: roundedCorners(albumImage, 8)
		})

		// Progress bar background
		canvas.add(new fabric.Rect({
			width: canvas.width - rem(3), height: rem(0.5),
			left: rem(1.5), top: canvas.height - rem(2),
			fill: "grey"
		}))

		// Progress bar foreground
		progress = new fabric.Rect({
			width: 0, height: rem(0.5),
			left: rem(1.5), top: canvas.height - rem(2),
			fill: "#f44336"
		})
		canvas.add(progress)

		// Parse subtitle file
		const subtitles = parseSrt(await fs.readFile(options_.subtitles, "utf8"))

		// Play audio
		audio.src = options_.audio
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
				opacity: 0.6
			})
			canvas.add(stub)
			stubs.push(stub)
		})

		// Title
		const title = [
			new fabric.Text(options_.name, {
				fontFamily: fontFamily.medium,
				fill: "white",
				fontSize: rem(3),
				left: canvas.width / 3,
				top: canvas.width / 4
			}),
			new fabric.Text(`Powered by Richienb/capper v${version}`, {
				fontFamily: fontFamily.normal,
				fill: "rgba(255, 255, 255, 0.8)",
				fontSize: rem(2),
				left: canvas.width / 3,
				top: (canvas.width / 4) + rem(4)
			})
		]
		title.forEach(object => canvas.add(object))

		const timeChanged = () => {
			// When 2 seconds are remaining in the audio
			if (Math.floor(audio.duration - audio.currentTime) === 2) {
				audio.removeEventListener("timeupdate", timeChanged)

				// Fade out all elements
				canvas.getObjects().forEach(fabricObject => {
					fabricObject.animate("opacity", 0, {
						...animationOptions,
						duration: 2000
					})
				})
			}
		}

		audio.addEventListener("timeupdate", timeChanged)

		// Spacing between subtitles
		const subSpacing = rem(5.5)

		// Set the main subtitle renderer
		subtitleRenderer = pCancelable((_, onCancel) => {
			let isCanceled = false

			onCancel.shouldReject = false
			onCancel(() => {
				isCanceled = true
			})

			return pEachSeries(subtitles, async ({ start: startTime, text: currentSubtitle }, subtitleIndex) => {
				// If rendering has already been canceled
				if (isCanceled) {
					return
				}

				// Wait until the subtitle should be displayed
				await delay(startTime - (audio.currentTime * 1000))

				// If rendered has been canceled
				if (isCanceled) {
					return
				}

				// Remove invisible elements
				canvas.getObjects().forEach(fabricObject => {
					if (fabricObject.get("opacity") === 0) {
						canvas.remove(fabricObject)
					}
				})

				// Get the previous and next subtitles
				const previousSubtitle = subtitles[subtitleIndex - 1] && subtitles[subtitleIndex - 1].text
				const nextSubtitle = subtitles[subtitleIndex + 1] && subtitles[subtitleIndex + 1].text

				// Increase size and brightness for active stub
				stubs[subtitleIndex].animate("opacity", 1, animationOptions)
				stubs[subtitleIndex].animate("height", stubHeight * 1.5, animationOptions)
				stubs[subtitleIndex].animate("top", canvas.height - rem(2.35), animationOptions)

				if (previousSubtitle) {
					// Revert previous stub
					stubs[subtitleIndex - 1].animate("opacity", 0.8, animationOptions)
					stubs[subtitleIndex - 1].animate("height", stubHeight, animationOptions)
					stubs[subtitleIndex - 1].animate("top", canvas.height - stubHeight - rem(1.35), animationOptions)

					// Previous subtitle -> Removed
					if (subs[0]) {
						subs[0].animate("opacity", "0", animationOptions)
						subs[0].animate("top", `-=${subSpacing}`, animationOptions)
					}

					// Current subtitle -> Previous subtitle
					subs[1].animate("opacity", "0.8", animationOptions)
					subs[1].animate("top", `-=${subSpacing}`, animationOptions)
					subs[1].set("fontFamily", fontFamily.normal)
					moveArrayItem(subs, 1, 0)

					// Next subtitle -> Current subtitle
					subs[2].animate("opacity", "1", animationOptions)
					subs[2].animate("top", `-=${subSpacing}`, animationOptions)
					subs[2].set("fontFamily", fontFamily.medium)
					moveArrayItem(subs, 2, 1)

					// None -> Next subtitle
					if (nextSubtitle) {
						subs[2] = new fabric.Text(nextSubtitle, {
							fontFamily: fontFamily.normal,
							fill: "white",
							fontSize: rem(3),
							opacity: 0
						})
						canvas.add(subs[2])
						subs[2].centerV()
						subs[2].centerH()
						subs[2].set("top", subs[2].get("top") + (subSpacing * 2))

						subs[2].animate("opacity", "0.8", animationOptions)
						subs[2].animate("top", `-=${subSpacing}`, animationOptions)
					}
				} else {
					// Current subtitle
					subs[1] = new fabric.Text(currentSubtitle, {
						fontFamily: fontFamily.medium,
						fill: "white",
						fontSize: rem(3),
						opacity: 0
					})
					canvas.add(subs[1])
					subs[1].centerV()
					subs[1].centerH()

					// Next subtitle
					subs[2] = new fabric.Text(nextSubtitle, {
						fontFamily: fontFamily.normal,
						fill: "white",
						fontSize: rem(3),
						opacity: 0
					})
					canvas.add(subs[2])
					subs[2].centerV()
					subs[2].centerH()
					subs[2].set("top", subs[2].get("top") + subSpacing)

					// Add subtitles
					subs[1].animate("opacity", "1", animationOptions)
					subs[2].animate("opacity", "0.8", animationOptions)

					const titleAnimationOptions = {
						...animationOptions,
						duration: 500
					}

					// Transition out the prominent album cover image
					albumImage.animate("top", albumImage.top - rem(2), titleAnimationOptions)
					albumImage.animate("opacity", 0, titleAnimationOptions)

					// Fade out the title when the first subtitle starts
					title.forEach(object => object.animate("opacity", "0", titleAnimationOptions))

					// Smaller album cover image to be displayed in the top-left.
					albumImage.clone(newAlbumImage => {
						newAlbumImage.set({
							top: 0,
							left: 32,
							opacity: 0,
							clipPath: roundedCorners(albumImage, 16)
						})
						newAlbumImage.scaleToWidth(64)
						canvas.add(newAlbumImage)
						newAlbumImage.animate("opacity", 1, titleAnimationOptions)
						newAlbumImage.animate("top", 32, titleAnimationOptions)
					})

					// Smaller song name text to be displayed in the top-left.
					const newSongNameText = new fabric.Text(options_.name, {
						fontFamily: fontFamily.normal,
						fill: "white",
						fontSize: rem(2),
						left: 112,
						top: 0,
						opacity: 0
					})
					canvas.add(newSongNameText)
					newSongNameText.animate("opacity", 1, titleAnimationOptions)
					newSongNameText.animate("top", 32, titleAnimationOptions)

					// Small artist name text to be displayed in the top-left.
					if (options_.artist) {
						const artistNameText = new fabric.Text(options_.artist, {
							fontFamily: fontFamily.normal,
							fill: "white",
							fontSize: rem(1.25),
							left: 113,
							top: 32,
							opacity: 0
						})
						canvas.add(artistNameText)
						artistNameText.animate("opacity", 1, titleAnimationOptions)
						artistNameText.animate("top", 68, titleAnimationOptions)
					}
				}
			})
		})(undefined)
	}

	const toggleSettingsEnabled = isEnabled => {
		const isDisabled = !isEnabled
		$(".options button").prop("disabled", isDisabled)
		$(".options__name").get(0).MDCTextField.disabled = isDisabled
		$(".options__artist").get(0).MDCTextField.disabled = isDisabled
	}

	async function record() {
		// Disable settings
		toggleSettingsEnabled(false)

		// Configure options
		const options = { mimeType: options_.format }
		const recordedBlobs = []

		// Starting playing
		await play()

		// Prepare recorder
		const sources = [audio.captureStream(), document.querySelector(".renderer").captureStream()]
		const streams = new MediaStream([...sources[1].getVideoTracks(), ...sources[0].getAudioTracks()])
		const mediaRecorder = new MediaRecorder(streams, options)

		// Start recordings
		mediaRecorder.start()

		// When recording is stopped
		mediaRecorder.addEventListener("stop", async () => {
			// Create blob of video file
			const superBuffer = new Blob(recordedBlobs, { type: options.mimeType })

			// Get file save location
			const { filePath: filename } = await electron.dialog.showSaveDialog(electron.getCurrentWindow(), {
				title: "Choose save location",

				defaultPath: path.join(electron.app.getPath("videos"), `${options_.name}.mp4`),

				buttonLabel: "Save",

				filters: [
					{ name: "Mp4 Videos", extensions: ["mp4"] },
					{ name: "All Files", extensions: ["*"] }
				]
			})

			// Save the blob to a file
			await fs.writeFile(filename, Buffer.from(webmToMp4(Buffer.from(await superBuffer.arrayBuffer()))))

			// Re-enable settings
			toggleSettingsEnabled(true)
		})

		// When data enabled
		mediaRecorder.addEventListener("dataavailable", ({ data }) => {
			// If data exists
			if (data && data.size > 0) {
				// Push the data to an array
				recordedBlobs.push(data)
			}
		})

		// When the audio ends
		audio.addEventListener("ended", () => {
			// Stop the recording
			mediaRecorder.stop()
		})
	}
})
