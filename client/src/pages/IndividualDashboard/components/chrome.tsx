import React, { createContext, useContext } from 'react';

type ChromeControls = {
  openNav: () => void;
  closeNav: () => void;
  navOpen: boolean;
};

const ChromeContext = createContext<ChromeControls>({
  openNav: () => undefined,
  closeNav: () => undefined,
  navOpen: false
});

export function ChromeProvider({ value, children }: { value: ChromeControls; children: React.ReactNode }) {
  return <ChromeContext.Provider value={value}>{children}</ChromeContext.Provider>;
}

export function useChrome() {
  return useContext(ChromeContext);
}
