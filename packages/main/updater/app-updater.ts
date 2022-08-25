import { RootStore } from '@lindo/shared'
import { app, dialog, shell } from 'electron'
import { logger } from '../logger'
import { I18n } from '../utils'
import { autoUpdater, UpdateInfo } from 'electron-updater'
import { UpdaterWindow } from '../windows/updater-window'
export class AppUpdater {
  private readonly _updaterWindow: UpdaterWindow
  private readonly _rootStore: RootStore
  private readonly _i18n: I18n

  private constructor(updaterWindow: UpdaterWindow, rootStore: RootStore, i18n: I18n) {
    this._updaterWindow = updaterWindow
    this._rootStore = rootStore
    this._i18n = i18n
  }

  static async init(rootStore: RootStore, i18n: I18n): Promise<AppUpdater> {
    const updaterWindow = await UpdaterWindow.init(rootStore, { show: false })
    return new AppUpdater(updaterWindow, rootStore, i18n)
  }

  async run() {
    // set the current version of the app
    logger.info('appUpdater -> Start app update checking...')
    const currentVersion = app.getVersion()
    this._rootStore.appStore.setLindoVersion(currentVersion)

    autoUpdater.logger = logger
    autoUpdater.autoDownload = false
    autoUpdater.setFeedURL({ provider: 'github', owner: 'zenoxs', repo: 'lindo-poc-update' })

    autoUpdater.on('checking-for-update', () => {
      logger.info('appUpdater -> Checking for updates...')
    })

    autoUpdater.on('update-available', ({ version, releaseNotes }: UpdateInfo) => {
      console.log(releaseNotes)
      logger.info('appUpdater -> An Update is available v' + version)
      let required = false
      if (typeof releaseNotes === 'string') {
        required = releaseNotes.includes('__update:required__') ?? false
      }
      this._showUpdateDialog(version, required)
    })

    autoUpdater.on('update-not-available', () => {
      logger.info('appUpdater -> There is no available update')
    })

    autoUpdater.on('download-progress', ({ percent }) => {
      this._updaterWindow.show()
      this._updaterWindow.sendProgress({ message: 'DOWNLOADING UPDATE', percent })
    })

    autoUpdater.on('update-downloaded', () => {
      logger.info('appUpdater -> Update downloaded, will install now')
      this._updaterWindow.close()
      autoUpdater.quitAndInstall()
    })

    autoUpdater.on('error', (error: Error) => {
      if (error) logger.info('appUpdater -> An error occured: ' + error)
    })

    return autoUpdater.checkForUpdatesAndNotify().then(() => {
      logger.info('appUpdater -> Update check done')
    })
  }

  private _showUpdateDialog(newVersion: string, required: boolean): Promise<void> {
    const buttons: Array<string> = [this._i18n.LL.main.updater.download()]
    if (!required) {
      buttons.push(this._i18n.LL.main.updater.ignore())
    }
    return dialog
      .showMessageBox({
        type: 'info',
        title: this._i18n.LL.main.updater.title({ version: newVersion }),
        message: required
          ? this._i18n.LL.main.updater.messageRequired({ version: newVersion })
          : this._i18n.LL.main.updater.message({ version: newVersion }),
        buttons
      })
      .then((returnValue) => {
        console.log(returnValue)
        if (returnValue.response === 0) {
          return autoUpdater.downloadUpdate().catch((err) => {
            logger.error('appUpdater -> unable to download automatically the release', err)
            return this._downloadFromWeb()
          })
        } else {
          logger.info('appUpdater -> App update ignored.')
        }
      })
  }

  private async _downloadFromWeb() {
    logger.info('appUpdater -> Redirected to app download page.')
    await shell.openExternal('https://github.com/prixe/lindo/releases/latest')
    app.exit()
  }
}
