// Freddie Butler monogram, redrawn as vectors from public/brand/fb-monogram.png so it stays sharp
// and the B can follow the theme (off-white on dark, charcoal on light). The F is always brand green.

export const F_PATH = 'M513 491 L1187 491 L1107 640 L650 641 L617 832 L1008 832 L932 970 L592 971 L530 1316 L365 1316 Z';
export const B_PATH =
  'M1131 662 L1280 662 C1420 662 1497 740 1497 870 C1497 940 1465 990 1422 1012 C1515 1035 1567 1110 1567 1215 ' +
  'C1567 1350 1470 1440 1330 1440 L680 1440 L763 1034 L935 1034 L973 965 L1253 965 C1310 965 1347 932 1347 885 ' +
  'C1347 836 1310 804 1262 804 L1058 804 Z ' +
  'M909 1104 L1295 1104 C1365 1104 1408 1145 1408 1200 C1408 1260 1365 1299 1300 1299 L872 1299 Z';

export function Monogram({ size = 32, title = 'Freddie Butler' }: { size?: number; title?: string }) {
  return (
    <svg className="monogram" viewBox="355 480 1222 970" width={(size * 1222) / 970} height={size} role="img" aria-label={title}>
      <path d={F_PATH} fill="var(--brand-green)" />
      <path d={B_PATH} fill="currentColor" fillRule="evenodd" />
    </svg>
  );
}

/** Monogram with "FREDDIE BUTLER / PERSONAL TRAINING", like the full logo. */
export function Wordmark() {
  return (
    <div className="wordmark">
      <Monogram size={64} />
      <div className="wm-name"><span className="wm-first">FREDDIE</span> <span>BUTLER</span></div>
      <div className="wm-sub"><span className="wm-line" />PERSONAL TRAINING<span className="wm-line" /></div>
    </div>
  );
}
