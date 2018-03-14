'use strict';

const Electron = require('electron');
const Application = Electron.app;
const BrowserWindow = Electron.BrowserWindow;
const EventEmitter = new(require('events')
  .EventEmitter)();

const FileSystem = require('fs');
const WatchJS = require('melanke-watchjs');
const Shortcuts = require('electron-localshortcut');

var isQuitting = false;

const isObject = obj => {
  const type = typeof obj;
  return type === 'function' || type === 'object' && !!obj;
};
const isString = str => Object.prototype.toString.call(str) === '[object String]';

const Window = function(name, title, url, setupTemplate, setup, showDevTools, options) {
  if (windowManager.windows[name]) {
    console.log('Window ' + name + ' already exists!');

    windowManager.focusOn(name);
    return;
  }

  this.name = name || 'window_' + (Object.keys(windowManager.windows)
    .length + 1);

  this.object = null;

  this.setup = {
    'show': false,
    'setupTemplate': setupTemplate
  };

  if (title) this.setup.title = title;
  if (url) this.setup.url = url;
  if (showDevTools) this.setup.showDevTools = showDevTools;

  if (isString(setup) && setup.indexOf('x') >= 0) {
    const dimensions = setup.split('x');
    setup = {
      'width': parseInt(dimensions[0], 10),
      'height': parseInt(dimensions[1], 10)
    };
  }

  if (isObject(setup)) {
    this.setup = Object.assign(this.setup, setup);
  }

  windowManager.windows[this.name] = this;
};

Window.prototype.set = function(prop, value) {
  if (value) {
    this.setup[prop] = value;
  } else if (isObject(prop)) {
    this.setup = Object.assign(this.setup, prop);
  }
};

Window.prototype.useLayout = function(name) {
  this.setup.layout = name;
};

Window.prototype.applySetupTemplate = function(name) {
  this.setup.setupTemplate = name;
};

Window.prototype.setURL = function(url) {
  this.setup.url = url;
};

Window.prototype.create = function(url) {
  let instance = this;

  if (url) {
    this.setup.url = url;
  }

  const config = windowManager.config;

  let template = this.setup.setupTemplate || config.defaultSetupTemplate;
  if (template && this.setup.setupTemplate !== false) {

    template = templates.get(template);

    if (template) {
      this.setup = Object.assign(template, this.setup);
    } else {
      console.log('The setup template "' + template + '" wasn\'t found!');
    }
  }

  if (!this.setup.title && config.defaultWindowTitle) {
    this.setup.title = config.defaultWindowTitle;
  }

  if (this.setup.title && config.windowsTitlePrefix && !config.defaultWindowTitle) {
    this.setup.title = config.windowsTitlePrefix + this.setup.title;
  }

  if (this.setup.position) {
    if (Array.isArray(this.setup.position)) {
      this.setup.x = this.setup.position[0];
      this.setup.y = this.setup.position[1];
    } else {

      const xy = utils.resolvePosition(this.setup);
      if (xy) {
        this.setup.y = xy[1];
        this.setup.x = xy[0];
      }
    }
  }

  if (!this.setup.resizable) this.setup.resizable = false;
  if (!this.setup.useContentSize) this.setup.useContentSize = true;
  if (!this.setup.x && !this.setup.y) this.setup.center = true;
  if (!this.setup.destroyOnClose) this.setup.destroyOnClose = false;

  this.object = new BrowserWindow(this.setup);

  console.log('Window "' + this.name + '" was created');

  this.object.webContents.on('did-fail-load', (ev, errorCode, errorDescription, validatedUrl, isMainFrame) => {
    //console.log('did-fail-load', a, b, c, d, e);
    console.log('event that failed', ev);
    console.log('error code', errorCode);
    console.log('error description', errorDescription);
    console.log('validatedUrl', validatedUrl);
    console.log('isMainFrame', isMainFrame);
    instance.down();
  });

  const bounds = this.object.getBounds();
  if (!this.setup.width) this.setup.width = bounds.width;
  if (!this.setup.height) this.setup.height = bounds.height;

  if (this.setup.url) {
    this.loadURL(this.setup.url);
  }

  if (this.setup.menu !== undefined) {
    this.object.setMenu(this.setup.menu);
  }

  if (this.setup.showDevTools === true) {
    this.object.toggleDevTools();
  }

  this.object.on('closed', function() {
    console.log('Window "' + instance.name + '" was closed');

    //instance.object.removeAllListeners();


    if (instance.setup.destroyOnClose) {
      delete windowManager.windows[instance.name];
    }
    // else if (!windowManager.isQuitting) {
    //   instance.create();
    // }
    instance.object = null;
    instance = null;
  });

  return this;
};

// Application.on('before-quit', () => {
//   console.log('setting is quit to true');
//   isQuitting = true;
// });

Window.prototype.open = function(url, hide) {
  // if (isObject(this.object)) {
  //   this.focus();
  //   return false;
  // }
  //
  // this.create(url);
  //
  // if (!hide) {
  //   this.object.show();
  // }

  if (isObject(this.object)) {
    if (!hide) {
      this.object.show();
      this.focus();
    }
  } else {
    this.create(url);

    this.onReady(true, window => {
      if (!hide) {
        window.object.show();
      }
    });
  }
};

Window.prototype.focus = function() {
  this.object.focus();

  return this;
};

Window.prototype.loadURL = function(url, options) {

  url = utils.readyURL(url || this.setup.url);

  const instance = this;
  const layout = this.setup.layout !== false ? this.setup.layout || windowManager.config.defaultLayout : false;


  let layoutFile = layouts.get(layout);
  if (layout && !layoutFile) {
    console.log('The layout "' + layout + '" wasn\'t found!');
  }

  if (layout && layoutFile && url.substring(0, 4) !== 'http') {
    url = url.replace('file://', '');
    layoutFile = layoutFile.replace('file://', '');

    FileSystem.readFile(layoutFile, 'utf-8', function(error, layoutCode) {
      if (error) {
        console.log('Couldn\'t load the layout file: ' + layoutFile);


        instance.down();

        return false;
      }

      FileSystem.readFile(url, 'utf-8', function(error, content) {
        if (error) {
          console.log('Couldn\'t load the target file:' + url);


          instance.down();

          return false;
        }

        content = layoutCode
          .replace(/\{\{appBase\}\}/g, utils.getAppLocalPath())
          .replace('{{content}}', content);

        instance.html(content, options);
      });
    });
  } else {
    instance.content()
      .loadURL(url, options);
  }
};

Window.prototype.html = function(code, options) {
  this.content()
    .loadURL('data:text/html;charset=utf-8,' + code, options);
};

Window.prototype.down = function() {

  this.setup.layout = false;


  const callback = this.setup.onLoadFailure || windowManager.config.onLoadFailure;


  callback.call(null, this);
};

Window.prototype.content = function() {
  return this.object.webContents;
};

Window.prototype.reload = function(ignoreCache) {
  if (ignoreCache === true) {
    this.content()
      .reloadIgnoringCache();
  } else {
    this.content()
      .reload();
  }
};

Window.prototype.currentURL = function() {
  return this.content()
    .getURL();
};

Window.prototype.onReady = function(withTheDomReady, callback) {
  const instance = this;
  const event = withTheDomReady === true ? 'dom-ready' : 'did-finish-load';


  this.content()
    .on(event, function() {
      callback.call(null, instance, instance.content());
    });
};

Window.prototype.execute = function(code) {
  this.content()
    .executeJavaScript(code);
};

Window.prototype.goBack = function() {
  if (this.content()
    .canGoBack()) {
    this.content()
      .goBack();
  }
};

Window.prototype.close = function() {
  this.object.close();
};

Window.prototype.destroy = function() {
  this.object.destroy();
  delete this;
  console.log('Window "' + this.name + '" was destroyed');
};

Window.prototype.minimize = function() {
  this.object.minimize();

  return this;
};

Window.prototype.maximize = function() {
  if (this.object.isMaximized()) this.object.restore();
  else this.object.maximize();

  return this;
};

Window.prototype.restore = function() {
  this.object.restore();

  return this;
};

Window.prototype.toFullScreen = function() {
  this.object.setFullScreen(true);

  return this;
};

Window.prototype.toggleDevTools = function(detached) {
  this.object.toggleDevTools({
    detached: detached || false
  });

  return this;
};

Window.prototype.registerShortcut = function(accelerator, callback) {
  const instance = this;

  Shortcuts.register(this.object, accelerator, function() {
    callback.call(null, instance);
  });

  return this;
};

Window.prototype.move = function(x, y) {
  const bounds = this.object.getBounds();

  if (isString(x)) {
    this.setup.position = x;
    const xy = utils.resolvePosition(this.setup);

    if (xy) {
      x = xy[0];
      y = xy[1];
    }
  }

  this.object.setBounds({
    'x': x || bounds.x,
    'y': y || bounds.y,
    'width': this.setup.width,
    'height': this.setup.height
  });

  return this;
};

Window.prototype.resize = function(width, heigt) {
  const bounds = this.object.getBounds();

  this.object.setBounds({
    'width': width || bounds.width,
    'height': heigt || bounds.height,
    'x': bounds.x,
    'y': bounds.y
  });

  return this;
};

const templates = {
  templates: {},
  set: function(name, setup) {
    if (!isObject(setup) || this.templates[name]) return false;

    this.templates[name] = setup;
  },
  get: function(name) {
    return Object.assign({}, this.templates[name]);
  },
  modify: function(name, setup) {
    if (!isObject(setup) || !this.templates[name]) return false;

    this.templates[name] = Object.assign(this.get(name), setup);
  },
  getProperty: function(name, prop) {
    return this.get(name)[prop];
  }
};

const utils = {
  getAppLocalPath: function() {
    return Application.getAppPath() + '/';
  },
  readyURL: function(url) {
    if (url[0] == '/') {
      url = url.slice(1);

      let newUrl = windowManager.config.appBase + url;

      if (!newUrl.includes('file://')) {
        newUrl = 'file://' + newUrl;
      }

      return newUrl;
    } else {
      return url.replace('{appBase}', windowManager.config.appBase);
    }
  },
  resolvePosition: function(setup) {
    const screen = Electron.screen;
    const screenSize = screen.getPrimaryDisplay()
      .workAreaSize;
    const position = setup.position;
    let x = 0;
    let y = 0;
    const positionMargin = 0;
    let windowWidth = setup.width;
    let windowHeight = setup.height;

    if (!windowWidth || !windowHeight) {
      console.log('Cannot position a window with the width/height not defined!');

      setup.center = true;
      return false;
    }

    if (['center', 'top', 'right', 'bottom', 'left', 'topLeft', 'leftTop', 'topRight',
        'rightTop', 'bottomRight', 'rightBottom', 'bottomLeft', 'leftBottom'
      ].indexOf(position) < 0) {
      console.log('The specified position "' + position + '" is\'not correct! Check the docs.');
      return false;
    }

    if (position === 'center') {
      return false;
    }

    if (setup.frame === true) {
      switch (position) {
        case 'left':
          break;

        case 'right':
          windowWidth += 8;
          break;

        case 'top':
          windowWidth += 13;
          break;

        case 'bottom':
          windowHeight += 50;
          windowWidth += 13;
          break;

        case 'leftTop':
        case 'topLeft':
          windowWidth += 0;
          windowHeight += 50;
          break;

        case 'rightTop':
        case 'topRight':
          windowWidth += 8;
          windowHeight += 50;
          break;

        case 'leftBottom':
        case 'bottomLeft':
          windowWidth -= 0;
          windowHeight += 50;
          break;

        case 'rightBottom':
        case 'bottomRight':
          windowWidth += 8;
          windowHeight += 50;
          break;
      }
    }

    switch (position) {
      case 'left':
        y = Math.floor((screenSize.height - windowHeight) / 2);
        x = positionMargin - 8;
        break;

      case 'right':
        y = Math.floor((screenSize.height - windowHeight) / 2);
        x = screenSize.width - windowWidth - positionMargin;
        break;

      case 'top':
        y = positionMargin;
        x = Math.floor((screenSize.width - windowWidth) / 2);
        break;

      case 'bottom':
        y = screenSize.height - windowHeight - positionMargin;
        x = Math.floor((screenSize.width - windowWidth) / 2);
        break;

      case 'leftTop':
      case 'topLeft':
        y = positionMargin;
        x = positionMargin - 8;
        break;

      case 'rightTop':
      case 'topRight':
        y = positionMargin;
        x = screenSize.width - windowWidth - positionMargin;
        break;

      case 'leftBottom':
      case 'bottomLeft':
        y = screenSize.height - windowHeight - positionMargin;
        x = positionMargin - 8;
        break;

      case 'rightBottom':
      case 'bottomRight':
        y = screenSize.height - windowHeight - positionMargin;
        x = screenSize.width - windowWidth - positionMargin;
        break;
    }

    return [x, y];
  }
};

const layouts = {
  layouts: {},
  add: function(name, path) {
    this.layouts[name] = utils.readyURL(path);
  },
  get: function(name) {
    return this.layouts[name];
  }
};

const windowManager = {
  templates: templates,
  layouts: layouts,
  utils: utils,
  eventEmitter: EventEmitter,
  shortcuts: Shortcuts,
  isQuitting: isQuitting,
  config: {
    'appBase': null,
    'devMode': true,
    'layouts': false,
    'defaultLayout': false,
    'defaultSetupTemplate': false,
    'defaultWindowTitle': null,
    'windowsTitlePrefix': null,
    "onLoadFailure": function(window) {
      window.content()
        .loadURL('file://' + __dirname + '/loadFailure.html');
    }
  },
  windows: {},
  init: function(config) {
    if (isObject(config)) {
      this.config = Object.assign(this.config, config);
    } else if (isString(config)) {
      if (config.length && config[config.length - 1] !== '/') {
        config = config + '/';
      }
      this.config.appBase = config;
    }

    if (!this.config.appBase) {
      this.config.appBase = utils.getAppLocalPath();
    }

    if (this.config.layouts && isObject(this.config.layouts)) {
      Object.keys(this.config.layouts)
        .forEach(key => {
          layouts.add(key, this.config.layouts[key]);
        });
    }

    if (this.config.devMode === true) {
      Application.on('ready', function() {

        Shortcuts.register('CmdOrCtrl+F12', function() {
          const window = windowManager.getCurrent();
          if (window) window.toggleDevTools();
        });

        Shortcuts.register('CmdOrCtrl+R', function() {
          const window = windowManager.getCurrent();
          if (window) window.reload();
        });
      });
    }

    if (this.config.defaultSetup) {
      this.setDefaultSetup(this.config.defaultSetup);
      delete this.config.defaultSetup;
    }
  },
  setDefaultSetup: function(setup) {
    if (!isObject(setup)) return false;


    templates.set('default', setup);


    this.config.defaultSetupTemplate = 'default';
  },
  importList: function(file) {
    const list = require(utils.getAppLocalPath() + file);
    if (!isObject(list)) return false;

    Object.keys(list)
      .forEach(key => {
        let window = list[key];
        windowManager.createNew(key, window.title, window.url, window.setupTemplate, window.setup);
      });
  },
  createNew: function(name, title, url, setupTemplate, setup, showDevTools, options) {
    const window = new Window(name, title, url, setupTemplate, setup, showDevTools, options);

    return window == null || Object.keys(window)
      .length === 0 ? false : window;
  },
  open: function(name, title, content, setupTemplate, setup, showDevTools) {
    const window = this.createNew(name, title, content, setupTemplate, setup, showDevTools);
    if (window) window.open();
    return window;
  },
  clone: function(name) {
    const window = this.get(name);
    if (!window) return;

    return this.createNew(false, false, false, false, this.setup);
  },
  get: function(name) {
    if (!this.windows[name]) {
      console.log('Window ' + name + ' doesn\'t exist!');
      return false;
    }

    return this.windows[name];
  },
  getById: function(id) {
    let instance;

    Object.keys(this.windows)
      .forEach(key => {
        let window = this.windows[key];

        if (window.object.id === id) {
          instance = window;
        }
      });
    return instance;
  },
  getCurrent: function() {
    const thisWindow = BrowserWindow.getFocusedWindow();
    if (!thisWindow) return false;

    return this.getById(thisWindow.id);
  },
  close: function(name) {
    this.get(name)
      .object.close();
  },
  closeCurrent: function() {
    const current = this.getCurrent();
    if (current) current.close();
  },
  destroy: function(name) {
    this.get(name)
      .destroy();
  },
  closeAll: function() {
    Object.keys(this.windows)
      .forEach(key => {
        let window = this.windows[key];
        window.close();
      });
  },
  closeAllExcept: function(name) {
    const windows = BrowserWindow.getAllWindows();

    const windowID = this.get(name)
      .object.id;
    if (!windows.length || !windowID) return false;

    Object.keys(windows)
      .forEach(key => {
        let window = windows[key];
        if (window.id !== windowID) {
          window.close();
        }
      });

    this.get(name)
      .focus();
  },
  focusOn: function(name) {
    this.get(name)
      .focus();
  },
  maximize: function(name) {
    const win = name ? this.get(name) : this.getCurrent();
    win.maximize();
  },
  minimize: function(name) {
    const win = name ? this.get(name) : this.getCurrent();
    win.minimize();
  },
  restore: function(name) {
    this.get(name)
      .object.restore();
  },
  devModeChoice: function(whenDevMode, whenNotDevMode) {
    return this.config.devMode === true ? whenDevMode : whenNotDevMode;
  },
  sharedData: {
    watcher: WatchJS,
    data: {},
    set: function(key, value) {
      this.data[key] = value;
    },
    fetch: function(key, altValue) {
      return this.data[key] ? this.data[key] : altValue;
    },
    watch: function(prop, callback) {
      this.watcher.watch(this.data, prop, callback);
    },
    unwatch: function(prop, callback) {
      this.watcher.unwatch(this.data, prop, callback);
    }
  },
  bridge: {
    on: function(event, callback) {
      let id = windowManager.eventEmitter.listenerCount(event);

      windowManager.eventEmitter.addListener(event, function(event) {
        callback.call(null, event.data, event.target, event.emittedBy);
      });

      return windowManager.eventEmitter.listeners(event)[id];
    },


    removeListener: function(event, handler) {
      windowManager.eventEmitter.removeListener(event, handler);
    },


    emit: function(event, data, target) {
      windowManager.eventEmitter.emit(event, {
        'emittedBy': windowManager.getCurrent()
          .name,
        'target': target,
        'data': data
      });
    }
  }
};

module.exports = windowManager;