const { app, BrowserWindow, shell, dialog, ipcMain, Menu } = require("electron");
const path = require("path");
const fs = require("fs");
const { spawn } = require("child_process");
const http = require("http");
const { autoUpdater } = require("electron-updater");

const NEXT_PORT = 3001;
const NEXT_URL  = `http://127.0.0.1:${NEXT_PORT}`;

// ─── Dev vs Production ────────────────────────────────────────────────────────
// In a packaged app, process.resourcesPath points to the app.asar/resources dir.
// We detect prod by checking if the app is packaged.
const IS_PROD = app.isPackaged;

// ─── Settings file path ──────────────────────────────────────────────────────
// In production, store settings in the user data directory (AppData on Windows)
// so they persist across updates and are writable. In dev, use project root.
function getSettingsPath() {
  if (IS_PROD) {
    return path.join(app.getPath("userData"), ".thumbgen-settings.json");
  }
  return path.join(__dirname, "..", ".thumbgen-settings.json");
}

// ─── Read settings from disk ─────────────────────────────────────────────────
function readSettingsSync() {
  try {
    const raw = fs.readFileSync(getSettingsPath(), "utf-8");
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

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
    // In a packaged app, resources are at process.resourcesPath.
    // The standalone server.js is at: resources/app/.next/standalone/server.js
    const standaloneDir = path.join(
      process.resourcesPath,
      "app", ".next", "standalone"
    );
    const serverJs = path.join(standaloneDir, "server.js");

    // Ensure the settings file is accessible from the standalone server's cwd.
    // The settings API route reads from path.join(process.cwd(), ".thumbgen-settings.json").
    // We symlink/copy the user-data settings file into the standalone dir so it's found.
    const settingsSrc  = getSettingsPath();
    const settingsDest = path.join(standaloneDir, ".thumbgen-settings.json");
    try {
      // Copy settings file into standalone dir (if it exists)
      if (fs.existsSync(settingsSrc)) {
        fs.copyFileSync(settingsSrc, settingsDest);
      }
    } catch (e) {
      console.warn("[main] Could not copy settings to standalone dir:", e.message);
    }

    // Read settings to inject as env vars for the Next.js server
    const settings = readSettingsSync();

    const env = {
      ...process.env,
      PORT:                    String(NEXT_PORT),
      HOSTNAME:                "127.0.0.1",
      NODE_ENV:                "production",
      // Make Electron binary behave as plain Node.js
      ELECTRON_RUN_AS_NODE:    "1",
      // Inject API keys from user settings into the server environment
      YOUTUBE_CLIENT_ID:       settings.youtubeClientId     || process.env.YOUTUBE_CLIENT_ID     || "",
      YOUTUBE_CLIENT_SECRET:   settings.youtubeClientSecret || process.env.YOUTUBE_CLIENT_SECRET || "",
      YOUTUBE_REDIRECT_URI:    settings.youtubeRedirectUri  || process.env.YOUTUBE_REDIRECT_URI  || `http://127.0.0.1:${NEXT_PORT}/api/auth/callback`,
      GEMINI_API_KEY:          settings.geminiApiKey         || process.env.GEMINI_API_KEY         || "",
      FAL_API_KEY:             settings.falAiApiKey          || process.env.FAL_API_KEY             || "",
      // Tell the server where the settings file lives (for the settings API route)
      SERMONTHUMB_SETTINGS_PATH: settingsSrc,
    };

    // Use process.execPath (Electron binary) with ELECTRON_RUN_AS_NODE=1
    // This makes it behave as a standard Node.js runtime
    nextProcess = spawn(process.execPath, [serverJs], {
      cwd:         standaloneDir,
      env,
      windowsHide: true,
    });

    nextProcess.stdout.on("data", (d) => process.stdout.write(`[next-prod] ${d}`));
    nextProcess.stderr.on("data", (d) => process.stderr.write(`[next-prod] ${d}`));
    nextProcess.on("error", reject);

    waitForNext(60000).then(resolve).catch(reject);
  });
}

// ─── Application Menu (with Help > Check for Updates) ───────────────────────
function buildAppMenu() {
  const version = app.getVersion();
  const template = [
    // On Windows/Linux the first menu entry is the app name menu
    {
      label: "SermonThumb",
      submenu: [
        { role: "quit" },
      ],
    },
    {
      label: "Edit",
      submenu: [
        { role: "undo" },
        { role: "redo" },
        { type: "separator" },
        { role: "cut" },
        { role: "copy" },
        { role: "paste" },
        { role: "selectAll" },
      ],
    },
    {
      label: "View",
      submenu: [
        { role: "reload" },
        { role: "forceReload" },
        { type: "separator" },
        { role: "resetZoom" },
        { role: "zoomIn" },
        { role: "zoomOut" },
        { type: "separator" },
        { role: "togglefullscreen" },
      ],
    },
    {
      label: "Help",
      submenu: [
        {
          label: `About SermonThumb v${version}`,
          click: () => {
            dialog.showMessageBox(mainWindow || undefined, {
              type:    "info",
              title:   `SermonThumb v${version}`,
              message: `SermonThumb v${version}`,
              detail:  "AI-powered sermon thumbnail generator for churches.\n\nMade with ❤️ by Vexona Studios.",
              buttons: ["OK"],
            });
          },
        },
        { type: "separator" },
        {
          id:    "check-for-updates-menu",
          label: "Check for Updates…",
          click: async () => {
            if (!IS_PROD) {
              dialog.showMessageBox(mainWindow || undefined, {
                type:    "info",
                title:   "Check for Updates",
                message: "Update checks are not available in development mode.",
                buttons: ["OK"],
              });
              return;
            }
            try {
              const result = await autoUpdater.checkForUpdates();
              const info = result?.updateInfo;
              if (info && info.version !== app.getVersion()) {
                // Update available — autoUpdater will download & show restart dialog
                dialog.showMessageBox(mainWindow || undefined, {
                  type:    "info",
                  title:   "Update Available",
                  message: `SermonThumb v${info.version} is available!`,
                  detail:  "The update will be downloaded in the background. You'll be prompted to restart when it's ready.",
                  buttons: ["OK"],
                });
              } else {
                dialog.showMessageBox(mainWindow || undefined, {
                  type:    "info",
                  title:   "You're up to date!",
                  message: `SermonThumb v${app.getVersion()} is the latest version.`,
                  buttons: ["OK"],
                });
              }
            } catch (e) {
              dialog.showMessageBox(mainWindow || undefined, {
                type:    "error",
                title:   "Update Check Failed",
                message: "Could not check for updates.",
                detail:  e.message,
                buttons: ["OK"],
              });
            }
          },
        },
      ],
    },
  ];

  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
}

// ─── Create the Electron window ───────────────────────────────────────────────
function createWindow() {
  const version = app.getVersion();
  mainWindow = new BrowserWindow({
    width:     1400,
    height:    900,
    minWidth:  900,
    minHeight: 600,
    title:     `SermonThumb v${version}`,
    icon:      IS_PROD
      ? path.join(process.resourcesPath, "app", ".next", "standalone", "public", "icon.png")
      : path.join(__dirname, "..", "public", "icon.png"),
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
      title:   "Update Ready — SermonThumb",
      message: `SermonThumb v${info.version} is ready to install.`,
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

// ─── IPC: read settings (direct file I/O — bypasses Next.js route) ───────────
ipcMain.handle("read-settings", () => {
  return readSettingsSync();
});

// ─── IPC: write settings (direct file I/O — bypasses Next.js route) ──────────
ipcMain.handle("write-settings", (_event, data) => {
  try {
    const settingsPath = getSettingsPath();
    // Ensure the directory exists
    const dir = path.dirname(settingsPath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

    // Merge with existing so a partial save never clobbers other keys
    const existing = readSettingsSync();
    const merged = { ...existing, ...data };
    fs.writeFileSync(settingsPath, JSON.stringify(merged, null, 2), "utf-8");

    // Also keep the standalone copy in sync so the Next.js server can still
    // serve the GET /api/settings response (used for display only, not auth).
    if (IS_PROD) {
      try {
        const standaloneDest = path.join(
          process.resourcesPath, "app", ".next", "standalone", ".thumbgen-settings.json"
        );
        fs.writeFileSync(standaloneDest, JSON.stringify(merged, null, 2), "utf-8");
      } catch { /* non-fatal */ }
    }

    return { ok: true };
  } catch (err) {
    console.error("[main] write-settings error:", err.message);
    return { ok: false, error: err.message };
  }
});

// ─── IPC: get/set settings path for renderer ──────────────────────────────────
ipcMain.handle("get-settings-path", () => {
  return getSettingsPath();
});

// ─── App lifecycle ────────────────────────────────────────────────────────────
app.whenReady().then(async () => {
  buildAppMenu();

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
      dialog.showErrorBox(
        "SermonThumb — Startup Error",
        `Failed to start the application server.\n\n${err.message}\n\nPlease try reinstalling the application.`
      );
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
  // NOTE: We do NOT copy settings from the standalone dir back to userdata here.
  // The Next.js API route already writes directly to the userdata path
  // (via SERMONTHUMB_SETTINGS_PATH env var). Copying the startup snapshot back
  // would overwrite any changes the user made during the session.
  if (nextProcess) { nextProcess.kill(); nextProcess = null; }
});

process.on("unhandledRejection", (reason) => { console.error("Unhandled Rejection:", reason); });
process.on("uncaughtException", (error)  => { console.error("Uncaught Exception:", error); });
