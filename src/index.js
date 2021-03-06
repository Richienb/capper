const path = require("path")
const { app, BrowserWindow, nativeImage } = require("electron")
const Sentry = require("@sentry/electron")
Sentry.init({ dsn: "https://be5edffe19ef4496b415f7f07eecab65@sentry.io/1866073" })

try {
	require("electron-reloader")(module) // eslint-disable-line node/no-unpublished-require
} catch (_) { }

require("electron-debug")()
require("update-electron-app")()

// Fix filesystem access problems after reload (https://github.com/electron/electron/issues/22119)
app.allowRendererProcessReuse = false

// Bypass Chrome autoplay policy
app.commandLine.appendSwitch("autoplay-policy", "no-user-gesture-required")

// Handle creating/removing shortcuts on Windows when installing/uninstalling.
if (require("electron-squirrel-startup")) {
	app.quit()
}

// Keep a global reference of the window to prevent garbage collection
let mainWindow

function createWindow() {
	// Create the browser window
	mainWindow = new BrowserWindow({
		title: "Capper",
		icon: nativeImage.createFromPath(path.join(__dirname, "icon.png")),
		show: false,
		webPreferences: {
			nodeIntegration: false,
			nodeIntegrationInWorker: false,
			enableRemoteModule: true,
			contextIsolation: true,
			preload: path.join(__dirname, "app.js"),
			defaultFontFamily: {
				standard: "Roboto",
				serif: "Roboto Slab",
				monospace: "Roboto Mono"
			}
		}
	})

	// Remove the menu bar
	mainWindow.removeMenu()

	// Maximize the window
	mainWindow.maximize()

	// And load the index.html of the app.
	mainWindow.loadURL(`file://${__dirname}/index.html`) // eslint-disable-line node/no-path-concat

	// Open DevTools
	// mainWindow.webContents.openDevTools()

	// When the dom has finished loading
	mainWindow.webContents.once("ready-to-show", () => {
		// Show the window
		mainWindow.show()
	})

	// Emitted when the window is closed.
	mainWindow.on("closed", () => {
		// Dereference the window object, usually you would store windows
		// in an array if your app supports multi windows, this is the time
		// when you should delete the corresponding element.
		mainWindow = null
	})
}

// When initialisation has finished
app.on("ready", createWindow)

// Quit when all windows are closed.
app.on("window-all-closed", () => {
	// On OS X it is common for applications and their menu bar
	// to stay active until the user quits explicitly with Cmd + Q
	if (process.platform !== "darwin") {
		app.quit()
	}
})

app.on("activate", () => {
	// On OS X it's common to re-create a window in the app when the
	// dock icon is clicked and there are no other windows open.
	if (mainWindow === null) {
		createWindow()
	}
})
