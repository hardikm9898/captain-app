import * as React from "react";

const MOBILE_BREAKPOINT = 768;

export function useIsMobile() {
  const [isMobile, setIsMobile] = React.useState<boolean | undefined>(undefined);

  React.useEffect(() => {
    const mql = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`);
    const onChange = () => {
      setIsMobile(window.innerWidth < MOBILE_BREAKPOINT);
    };
    mql.addEventListener("change", onChange);
    setIsMobile(window.innerWidth < MOBILE_BREAKPOINT);
    return () => mql.removeEventListener("change", onChange);
  }, []);

  return !!isMobile;
}

// A landscape tablet (1024px and up): the order screen shows the cart beside
// the menu instead of in a bottom sheet (owner, list 6 issue 11).
const WIDE_BREAKPOINT = 1024;

export function useIsWide() {
  const [wide, setWide] = React.useState(
    () => typeof window !== "undefined" && window.innerWidth >= WIDE_BREAKPOINT,
  );
  React.useEffect(() => {
    const mql = window.matchMedia(`(min-width: ${WIDE_BREAKPOINT}px)`);
    const onChange = () => setWide(mql.matches);
    mql.addEventListener("change", onChange);
    onChange();
    return () => mql.removeEventListener("change", onChange);
  }, []);
  return wide;
}
