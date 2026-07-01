// Test script: Launch Electron app in xvfb, take screenshots, test UI
const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const http = require('http');

let mainWindow;

// Override main.js auth to auto-login (skip the login screen)
// We'll inject test config before the window loads

app.whenReady().then(async () => {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      preload: path.join(__dirname, '..', 'electron', 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  // Auto-login via IPC before the renderer loads
  // The renderer calls window.jarvis.auth.login() which triggers ipcMain 'auth:login'
  // That handler already exists in main.js — we just need to make sure it works

  // Load the built app
  await mainWindow.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));

  // Wait for app to initialize
  await new Promise(resolve => setTimeout(resolve, 3000));

  // Take screenshot
  const screenshotPath = path.join(__dirname, 'screenshot-chat.png');
  const image = await mainWindow.webContents.capturePage();
  require('fs').writeFileSync(screenshotPath, image.toPNG());
  console.log('Screenshot saved:', screenshotPath);

  // Get the app state via devtools
  const state = await mainWindow.webContents.executeJavaScript(`
    (function() {
      const root = document.getElementById('root');
      return {
        hasApp: !!root,
        appHTML: root ? root.innerHTML.substring(0, 2000) : 'no root',
        bodyText: document.body.innerText.substring(0, 1000),
      };
    })()
  `);
  console.log('STATE:', JSON.stringify(state, null, 2));

  // Check for error messages
  const errors = await mainWindow.webContents.executeJavaScript(`
    (function() {
      const errorEls = document.querySelectorAll('.app-error, .message-error');
      return Array.from(errorEls).map(e => e.textContent);
    })()
  `);
  console.log('ERRORS:', JSON.stringify(errors));

  // Check if composer exists
  const composer = await mainWindow.webContents.executeJavaScript(`
    (function() {
      const composer = document.querySelector('.composer');
      const textarea = document.querySelector('.composer textarea');
      const sendBtn = document.querySelector('.send-button');
      const attachBtn = document.querySelector('.attach-button');
      const fileInput = document.querySelector('input[type="file"]');
      return {
        hasComposer: !!composer,
        hasTextarea: !!textarea,
        textareaDisabled: textarea ? textarea.disabled : null,
        hasSendBtn: !!sendBtn,
        sendBtnDisabled: sendBtn ? sendBtn.disabled : null,
        hasAttachBtn: !!attachBtn,
        attachBtnDisabled: attachBtn ? attachBtn.disabled : null,
        hasFileInput: !!fileInput,
      };
    })()
  `);
  console.log('COMPOSER:', JSON.stringify(composer, null, 2));

  // Check sidebar / profiles
  const sidebar = await mainWindow.webContents.executeJavaScript(`
    (function() {
      const profiles = document.querySelectorAll('.profile-option');
      const navButtons = document.querySelectorAll('.nav-item');
      return {
        profileCount: profiles.length,
        navButtons: Array.from(navButtons).map(b => b.textContent.trim()),
        profileNames: Array.from(profiles).map(p => p.querySelector('.profile-name')?.textContent),
      };
    })()
  `);
  console.log('SIDEBAR:', JSON.stringify(sidebar, null, 2));

  // Check sessions tab
  const sessionsTab = document.querySelector('[data-view="sessions"]') || 
    Array.from(document.querySelectorAll('.nav-item')).find(b => b.textContent.includes('Session'));
  if (sessionsTab) {
    // Click sessions tab
    await mainWindow.webContents.executeJavaScript(`
      (function() {
        const btns = document.querySelectorAll('.nav-item');
        for (const b of btns) {
          if (b.textContent.includes('Session')) b.click();
        }
      })()
    `);
    await new Promise(resolve => setTimeout(resolve, 2000));

    const sessionsState = await mainWindow.webContents.executeJavaScript(`
      (function() {
        const cards = document.querySelectorAll('.session-card');
        const titles = Array.from(cards).map(c => {
          const t = c.querySelector('.session-title');
          const p = c.querySelector('.session-preview');
          return {
            title: t ? t.textContent : '(no title)',
            preview: p ? p.textContent.substring(0, 60) : '(no preview)',
          };
        });
        const empty = document.querySelector('.empty-state');
        return {
          cardCount: cards.length,
          hasEmptyState: !!empty,
          emptyText: empty ? empty.textContent : null,
          sessions: titles,
        };
      })()
    `);
    console.log('SESSIONS:', JSON.stringify(sessionsState, null, 2));

    // Screenshot sessions view
    const ss2 = path.join(__dirname, 'screenshot-sessions.png');
    const img2 = await mainWindow.webContents.capturePage();
    require('fs').writeFileSync(ss2, img2.toPNG());
    console.log('Sessions screenshot:', ss2);
  }

  // Go back to chat and test attachment button
  await mainWindow.webContents.executeJavaScript(`
    (function() {
      const btns = document.querySelectorAll('.nav-item');
      for (const b of btns) {
        if (b.textContent.includes('Chat')) b.click();
      }
    })()
  `);
  await new Promise(resolve => setTimeout(resolve, 1000));

  // Test the attach button
  const attachTest = await mainWindow.webContents.executeJavaScript(`
    (function() {
      const btn = document.querySelector('.attach-button');
      if (!btn) return { hasBtn: false };
      const disabled = btn.disabled;
      // Don't click — just check state
      return {
        hasBtn: true,
        disabled: disabled,
        title: btn.title,
      };
    })()
  `);
  console.log('ATTACH_BTN:', JSON.stringify(attachTest));

  // Test drag-drop handlers
  const dragTest = await mainWindow.webContents.executeJavaScript(`
    (function() {
      const container = document.querySelector('.messages-container');
      return {
        hasContainer: !!container,
        hasDragEnter: !!container?.ondragenter,
        hasDragOver: !!container?.ondragover,
        hasDrop: !!container?.ondrop,
        classes: container ? container.className : null,
      };
    })()
  `);
  console.log('DRAG:', JSON.stringify(dragTest));

  // Check console errors
  const consoleMessages = [];
  mainWindow.webContents.on('console-message', (event, level, message, line, sourceId) => {
    consoleMessages.push({ level, message, sourceId });
  });

  // Wait a bit more for any async errors
  await new Promise(resolve => setTimeout(resolve, 2000));
  console.log('CONSOLE:', JSON.stringify(consoleMessages.slice(-10)));

  app.quit();
});

// Catch errors
process.on('uncaughtException', (err) => {
  console.error('UNCAUGHT:', err);
  app.quit();
});