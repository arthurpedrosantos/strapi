import type { CLIContext } from '@strapi/strapi';
import * as tsUtils from '@strapi/typescript-utils';
import { joinBy } from '@strapi/utils';
import chokidar from 'chokidar';
import cluster from 'node:cluster';
import strapiFactory from '@strapi/strapi';

import { getTimer } from './core/timer';
import { checkRequiredDependencies } from './core/dependencies';
import { createBuildContext } from './createBuildContext';
import type { WebpackWatcher } from './webpack/watch';
import type { ViteWatcher } from './vite/watch';

import EE from '@strapi/strapi/dist/utils/ee';
import { writeStaticClientFiles } from './staticFiles';

interface DevelopOptions extends CLIContext {
  /**
   * @default false
   */
  ignorePrompts?: boolean;
  /**
   * Which bundler to use for building.
   *
   * @default webpack
   */
  bundler?: 'webpack' | 'vite';
  polling?: boolean;
  open?: boolean;
  watchAdmin?: boolean;
}

const develop = async ({
  cwd,
  polling,
  logger,
  tsconfig,
  ignorePrompts,
  watchAdmin,
  ...options
}: DevelopOptions) => {
  const timer = getTimer();

  if (cluster.isPrimary) {
    const { didInstall } = await checkRequiredDependencies({ cwd, logger, ignorePrompts }).catch(
      (err) => {
        logger.error(err.message);
        process.exit(1);
      }
    );

    if (didInstall) {
      return;
    }

    /**
     * IF we're not watching the admin we're going to build it, this makes
     * sure that at least the admin is built for users & they can interact
     * with the application.
     */
    if (!watchAdmin) {
      timer.start('createBuildContext');
      const contextSpinner = logger.spinner(`Building build context`).start();
      console.log('');

      const ctx = await createBuildContext({
        cwd,
        logger,
        tsconfig,
        options,
      });
      const contextDuration = timer.end('createBuildContext');
      contextSpinner.text = `Building build context (${contextDuration}ms)`;
      contextSpinner.succeed();

      timer.start('creatingAdmin');
      const adminSpinner = logger.spinner(`Creating admin`).start();

      EE.init(cwd);
      await writeStaticClientFiles(ctx);

      if (ctx.bundler === 'webpack') {
        const { build: buildWebpack } = await import('./webpack/build');
        await buildWebpack(ctx);
      } else if (ctx.bundler === 'vite') {
        const { build: buildVite } = await import('./vite/build');
        await buildVite(ctx);
      }

      const adminDuration = timer.end('creatingAdmin');
      adminSpinner.text = `Creating admin (${adminDuration}ms)`;
      adminSpinner.succeed();
    }

    cluster.on('message', async (worker, message) => {
      switch (message) {
        case 'reload': {
          logger.debug('cluster has the reload message, sending the worker kill message');
          worker.send('kill');
          break;
        }
        case 'killed': {
          logger.debug('cluster has the killed message, forking the cluster');
          cluster.fork();
          break;
        }
        case 'stop': {
          process.exit(1);
          break;
        }
        default:
          break;
      }
    });

    cluster.fork();
  }

  if (cluster.isWorker) {
    if (tsconfig?.config) {
      timer.start('compilingTS');
      const compilingTsSpinner = logger.spinner(`Compiling TS`).start();

      tsUtils.compile(cwd, { configOptions: { ignoreDiagnostics: false } });

      const compilingDuration = timer.end('compilingTS');
      compilingTsSpinner.text = `Compiling TS (${compilingDuration}ms)`;
      compilingTsSpinner.succeed();
    }

    const strapi = strapiFactory({
      appDir: cwd,
      distDir: tsconfig?.config.options.outDir ?? '',
      autoReload: true,
      serveAdminPanel: !watchAdmin,
    });

    let bundleWatcher: WebpackWatcher | ViteWatcher | undefined;

    if (watchAdmin) {
      timer.start('createBuildContext');
      const contextSpinner = logger.spinner(`Building build context`).start();
      console.log('');

      const ctx = await createBuildContext({
        cwd,
        logger,
        tsconfig,
        strapi,
        options,
      });
      const contextDuration = timer.end('createBuildContext');
      contextSpinner.text = `Building build context (${contextDuration}ms)`;
      contextSpinner.succeed();

      timer.start('creatingAdmin');
      const adminSpinner = logger.spinner(`Creating admin`).start();

      EE.init(cwd);
      await writeStaticClientFiles(ctx);

      if (ctx.bundler === 'webpack') {
        const { watch: watchWebpack } = await import('./webpack/watch');
        bundleWatcher = await watchWebpack(ctx);
      } else if (ctx.bundler === 'vite') {
        const { watch: watchVite } = await import('./vite/watch');
        bundleWatcher = await watchVite(ctx);
      }

      const adminDuration = timer.end('creatingAdmin');
      adminSpinner.text = `Creating admin (${adminDuration}ms)`;
      adminSpinner.succeed();
    }

    const strapiInstance = await strapi.load();

    timer.start('generatingTS');
    const generatingTsSpinner = logger.spinner(`Generating types`).start();

    await tsUtils.generators.generate({
      strapi: strapiInstance,
      pwd: cwd,
      rootDir: undefined,
      logger: { silent: true, debug: false },
      artifacts: { contentTypes: true, components: true },
    });

    const generatingDuration = timer.end('generatingTS');
    generatingTsSpinner.text = `Generating types (${generatingDuration}ms)`;
    generatingTsSpinner.succeed();

    const restart = async () => {
      if (strapiInstance.reload.isWatching && !strapiInstance.reload.isReloading) {
        strapiInstance.reload.isReloading = true;
        strapiInstance.reload();
      }
    };

    const watcher = chokidar
      .watch(cwd, {
        ignoreInitial: true,
        usePolling: polling,
        ignored: [
          /(^|[/\\])\../, // dot files
          /tmp/,
          '**/src/admin/**',
          '**/src/plugins/**/admin/**',
          '**/dist/src/plugins/test/admin/**',
          '**/documentation',
          '**/documentation/**',
          '**/node_modules',
          '**/node_modules/**',
          '**/plugins.json',
          '**/build',
          '**/build/**',
          '**/index.html',
          '**/public',
          '**/public/**',
          strapiInstance.dirs.static.public,
          joinBy('/', strapiInstance.dirs.static.public, '**'),
          '**/*.db*',
          '**/exports/**',
          '**/dist/**',
          '**/*.d.ts',
          ...strapiInstance.config.get('admin.watchIgnoreFiles', []),
        ],
      })
      .on('add', (path) => {
        strapiInstance.log.info(`File created: ${path}`);
        restart();
      })
      .on('change', (path) => {
        strapiInstance.log.info(`File changed: ${path}`);
        restart();
      })
      .on('unlink', (path) => {
        strapiInstance.log.info(`File deleted: ${path}`);
        restart();
      });

    process.on('message', async (message) => {
      switch (message) {
        case 'kill': {
          logger.debug(
            'child process has the kill message, destroying the strapi instance and sending the killed process message'
          );
          await watcher.close();
          await strapiInstance.destroy();

          if (bundleWatcher) {
            bundleWatcher.close();
          }
          process.send?.('killed');
          break;
        }
        default:
          break;
      }
    });

    strapiInstance.start();
  }
};

export { develop };
export type { DevelopOptions };
