import React, { lazy } from 'react';

type ComponentModule<TProps = any> = { default: React.ComponentType<TProps> };

export function lazyWithRetry<TProps = any>(
  importer: () => Promise<ComponentModule<TProps>>,
  retries: number = 2,
  delayMs: number = 500
) {
  let attempt = 0;

  const load = (): Promise<ComponentModule<TProps>> =>
    importer().catch((error: any) => {
      const text = `${error?.name ?? ''} ${error?.message ?? ''}`;
      const isChunkError = /ChunkLoadError|Loading chunk|failed to fetch dynamically imported module|import\(\) failed/i.test(text);

      if (isChunkError && attempt < retries) {
        attempt += 1;
        return new Promise<void>((resolve) => setTimeout(resolve, delayMs)).then(() => load());
      }

      throw error;
    });

  return lazy(() => load());
}




