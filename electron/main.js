const { app, BrowserWindow, shell, dialog, ipcMain } = require("electron");
const path = require("path");
const { spawn } = require("child_process");
const http = require("http");
const { autoUpdater } = require("electron-updater");

const NEXT_PORT = 3001;
const NEXT_URL  = `http://127.0.0.1:${NEXT_PORT}`;

// ─── Dev vs Production ────────────────────────────────────────────────────────
// In a packaged app, process.resourcesPath points to the app.asar/resources dir.
// We detect prod by checking if the app is packaged.
const IS_PROD = app.isPackaged;

// ─── Recognise BOTH 127.0.0.1 and localhost as "our" app ─────────────────────
function isLocalUrl(url) {
  return (
    url.startsWith(`http://127.0.0.1:${NEXT_PORT}`) ||
    url.startsWith(`http://localhost:${NEXT_PORT}`)
  );
}

function isGoogleUrl(url) {
  return (
    url.includes("accounts.google.com") ||
    url.includes("google.com/o/oauth")  ||
    url.includes("oauth2.googleapis.com")
  );
}

let mainWindow  = null;
let nextProcess = null;

// ─── Check if Next.js is already listening ────────────────────────────────────
function isNextRunning() {
  return new Promise((resolve) => {
    const req = http.get(NEXT_URL, (res) => {
      resolve(res.statusCode < 500);
    });
    req.on("error", () => resolve(false));
    req.setTimeout(1500, () => { req.destroy(); resolve(false); });
  });
}

// ─── Poll until Next is ready ─────────────────────────────────────────────────
function waitForNext(timeout = 90000) {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    const interval = setInterval(async () => {
      if (await isNextRunning()) {
        clearInterval(interval);
        resolve();
      } else if (Date.now() - start > timeout) {
        clearInterval(interval);
        reject(new Error("Timed out waiting for Next.js"));
      }
    }, 800);
  });
}

// ─── Start Next.js dev server (development only) ─────────────────────────────
function startNextDev() {
  return new Promise((resolve, reject) => {
    nextProcess = spawn("npm", ["run", "dev", "--", "--port", String(NEXT_PORT)], {
      cwd: path.join(__dirname, ".."),
      env: { ...process.env },
      shell: true,        // required on Windows so npm.cmd resolves
      windowsHide: true,
    });

    nextProcess.stdout.on("data", (d) => process.stdout.write(`[next] ${d}`));
    nextProcess.stderr.on("data", (d) => process.stderr.write(`[next] ${d}`));
    nextProcess.on("error", reject);

    waitForNext().then(resolve).catch(reject);
  });
}

// ─── Start standalone Next.js server (production) ────────────────────────────
function startNextProd() {
  return new Promise((resolve, reject) => {
    // In a packaged app, resources are at process.resourcesPath/app.asar (or
    // unpacked equivalent). The standalone server.js is at:
    //   resources/app/.next/standalone/server.js
    const serverJs = path.join(
      IS_PROD ? process.resourcesPath : path.join(__dirname, ".."),
      IS_PROD ? "app" : "",
      ".next", "standalone", "server.js"
    );

    const env = {
      ...process.env,
      PORT:     String(NEXT_PORT),
      HOSTNAME: "127.0.0.1",
      NODE_ENV: "production",
    };

    nextProcess = spawn(process.execPath, [serverJs], {
      cwd:        path.dirname(serverJs),
      env,
      windowsHide: true,
    });

    nextProcess.stdout.on("data", (d) => process.stdout.write(`[next-prod] ${d}`));
    nextProcess.stderr.on("data", (d) => process.stderr.write(`[next-prod] ${d}`));
    nextProcess.on("error", reject);

    waitForNext(60000).then(resolve).catch(reject);
  });
}

// ─── Create the Electron window ───────────────────────────────────────────────
function createWindow() {
  mainWindow = new BrowserWindow({
    width:     1400,
    height:    900,
    minWidth:  900,
    minHeight: 600,
    title:     "ThumbGen",
    backgroundColor: "#0a0d14",
    webPreferences: {
      nodeIntegration:  false,
      contextIsolation: true,
      webSecurity:      true,
      preload:          path.join(__dirname, "preload.js"),
    },
    show: false,
  });

  mainWindow.once("ready-to-show", () => {
    mainWindow.show();
    mainWindow.focus();
  });

  mainWindow.loadURL(NEXT_URL);

  // ─── Navigation guard ─────────────────────────────────────────────────────
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (isLocalUrl(url) || isGoogleUrl(url)) return { action: "allow" };
    shell.openExternal(url);
    return { action: "deny" };
  });

  mainWindow.webContents.on("will-navigate", (event, url) => {
    if (isLocalUrl(url) || isGoogleUrl(url)) return;
    event.preventDefault();
    shell.openExternal(url);
  });

  // ─── Intercept child windows (OAuth) ─────────────────────────────────────
  app.on("web-contents-created", (_e, wc) => {
    wc.on("will-navigate", (event, url) => {
      if (isLocalUrl(url) || isGoogleUrl(url)) {
        if (isLocalUrl(url) && mainWindow) {
          event.preventDefault();
          mainWindow.loadURL(url);
        }
        return;
      }
      event.preventDefault();
      shell.openExternal(url);
    });
  });

  // ─── Auto-escape from Google OAuth error pages ────────────────────────────
  mainWindow.webContents.on("did-navigate", (_event, url) => {
    const isGoogleError =
      isGoogleUrl(url) &&
      (url.includes("error=") || url.includes("errorCode="));
    if (isGoogleError) {
      setTimeout(() => {
        if (mainWindow) mainWindow.loadURL(`${NEXT_URL}/?error=oauth_failed`);
      }, 1200);
    }
  });

  // ─── Keyboard shortcuts ───────────────────────────────────────────────────
  mainWindow.webContents.on("before-input-event", (_event, input) => {
    if (!mainWindow) return;
    const wc = mainWindow.webContents;
    if (input.type === "keyDown" && input.key === "ArrowLeft"  && input.alt && wc.canGoBack())    wc.goBack();
    if (input.type === "keyDown" && input.key === "ArrowRight" && input.alt && wc.canGoForward()) wc.goForward();
    if (input.type === "keyDown" && input.key === "Escape") {
      if (!isLocalUrl(wc.getURL())) wc.loadURL(NEXT_URL);
    }
  });

  mainWindow.on("closed", () => { mainWindow = null; });
}

// ─── Auto-Updater ─────────────────────────────────────────────────────────────
function setupAutoUpdater() {
  // Don't check for updates in dev mode
  if (!IS_PROD) return;

  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;

  autoUpdater.on("checking-for-update", () => {
    console.log("[updater] Checking for update…");
  });

  autoUpdater.on("update-available", (info) => {
    console.log(`[updater] Update available: v${info.version}`);
    // Notify renderer so it can show a subtle banner
    if (mainWindow) {
      mainWindow.webContents.send("update-available", { version: info.version });
    }
  });

  autoUpdater.on("update-not-available", () => {
    console.log("[updater] Already on latest version.");
  });

  autoUpdater.on("download-progress", (progress) => {
    const pct = Math.round(progress.percent);
    console.log(`[updater] Downloading… ${pct}%`);
    if (mainWindow) {
      mainWindow.webContents.send("update-download-progress", { percent: pct });
    }
  });

  autoUpdater.on("update-downloaded", (info) => {
    console.log(`[updater] Update downloaded: v${info.version}`);
    if (mainWindow) {
      mainWindow.webContents.send("update-downloaded", { version: info.version });
    }

    dialog.showMessageBox(mainWindow || undefined, {
      type:    "info",
      title:   "Update Ready — ThumbGen",
      message: `ThumbGen v${info.version} is ready to install.`,
      detail:  "The update has been downloaded. Restart now to apply it, or continue working and it will install when you quit.",
      buttons: ["Restart & Install", "Later"],
      defaultId: 0,
      cancelId:  1,
    }).then(({ response }) => {
      if (response === 0) {
        autoUpdater.quitAndInstall();
      }
    });
  });

  autoUpdater.on("error", (err) => {
    console.error("[updater] Error:", err.message);
  });

  // Check on startup, then every 4 hours
  try {
    autoUpdater.checkForUpdatesAndNotify();
  } catch (e) {
    console.error("[updater] Startup check failed:", e);
  }
  setInterval(() => {
    try { autoUpdater.checkForUpdatesAndNotify(); } catch (e) { /* ignore */ }
  }, 4 * 60 * 60 * 1000);
}

// ─── IPC: manual update check from renderer ───────────────────────────────────
ipcMain.handle("check-for-updates", async () => {
  if (!IS_PROD) return { status: "dev-mode" };
  try {
    const result = await autoUpdater.checkForUpdates();
    return { status: "checked", updateInfo: result?.updateInfo ?? null };
  } catch (e) {
    return { status: "error", message: e.message };
  }
});

ipcMain.handle("install-update", () => {
  autoUpdater.quitAndInstall();
});

// ─── App lifecycle ────────────────────────────────────────────────────────────
app.whenReady().then(async () => {
  const alreadyRunning = await isNextRunning();

  if (alreadyRunning) {
    console.log("Next.js already running — opening window.");
    createWindow();
    setupAutoUpdater();
  } else if (IS_PROD) {
    console.log("Starting Next.js standalone server…");
    try {
      await startNextProd();
      console.log("Next.js production server ready — opening window.");
      createWindow();
      setupAutoUpdater();
    } catch (err) {
      console.error("Failed to start Next.js production server:", err);
      app.quit();
    }
  } else {
    console.log("Starting Next.js dev server…");
    try {
      await startNextDev();
      console.log("Next.js dev server ready — opening window.");
      createWindow();
      setupAutoUpdater();
    } catch (err) {
      console.error("Failed to start Next.js:", err);
      app.quit();
    }
  }
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});

app.on("before-quit", () => {
  if (nextProcess) { nextProcess.kill(); nextProcess = null; }
});

process.on("unhandledRejection", (reason) => { console.error("Unhandled Rejection:", reason); });
process.on("uncaughtException", (error)  => { console.error("Uncaught Exception:", error); });
