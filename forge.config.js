module.exports = {
  packagerConfig: {
    asar: true,
    executableName: 'SSMaterialDataCalc',
    appBundleId: 'com.yujay.ssmatdatacalc',
    ignore: [
      /^\/\.git($|\/)/,
      /^\/outputs\/scripts($|\/)/,
      /^\/out($|\/)/
    ]
  },
  makers: [
    { name: '@electron-forge/maker-squirrel', config: { name: 'SSMaterialDataCalc' } },
    { name: '@electron-forge/maker-zip', platforms: ['win32'] }
  ]
};
