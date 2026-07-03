function buildLoginItemSettings({
  openAtLogin,
  execPath = process.execPath,
  appPath,
  isPackaged = false,
} = {}) {
  return {
    openAtLogin: Boolean(openAtLogin),
    path: execPath,
    args: isPackaged || !appPath ? [] : [appPath],
  };
}

module.exports = {
  buildLoginItemSettings,
};
