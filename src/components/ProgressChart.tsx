import Chart from 'chart.js/auto';
import { useEffect, useRef, useState } from 'react';

interface Props {
  labels: string[];
  values: (number | null)[];
  unit: string;
  kind?: 'line' | 'bar';
  height?: number;
  /** Optional raw readings drawn as faint dots behind the line (e.g. daily weigh-ins under the 7-day average). */
  points?: (number | null)[];
  /** Y axis bounds (e.g. 1–5 for check-ins). */
  min?: number;
  max?: number;
}

/** Line or bar chart that takes its colours from the CSS variables, and redraws when light/dark mode changes. */
export function ProgressChart({ labels, values, unit, kind = 'line', height, points, min, max }: Props) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [scheme, setScheme] = useState(0);

  useEffect(() => {
    // Redraw when the phone switches light/dark, or the app's theme setting changes.
    const mq = matchMedia('(prefers-color-scheme: dark)');
    const onChange = () => setScheme((n) => n + 1);
    mq.addEventListener('change', onChange);
    window.addEventListener('themechange', onChange);
    return () => { mq.removeEventListener('change', onChange); window.removeEventListener('themechange', onChange); };
  }, []);

  useEffect(() => {
    const css = getComputedStyle(document.documentElement);
    const color = (v: string) => css.getPropertyValue(v).trim();
    const chart = new Chart(canvas.current!, {
      type: kind,
      data: {
        labels,
        datasets: [{
          data: values,
          borderColor: color('--accent'),
          backgroundColor: kind === 'bar' ? color('--accent') : color('--accent-soft'),
          pointBackgroundColor: color('--accent'),
          fill: true,
          tension: 0.3,
          pointRadius: 4,
          pointHoverRadius: 6,
          borderRadius: 4,
          maxBarThickness: 22,
          spanGaps: true,
          ...(points ? { pointRadius: 0, pointHoverRadius: 4, fill: false } : {})
        }, ...(points ? [{
          type: 'line' as const,
          data: points,
          showLine: false,
          pointRadius: 3,
          pointHoverRadius: 5,
          pointBackgroundColor: color('--muted'),
          borderColor: color('--muted')
        }] : [])]
      },
      options: {
        maintainAspectRatio: false,
        interaction: { mode: 'index', intersect: false },
        plugins: {
          legend: { display: false },
          tooltip: { callbacks: { label: (c) => `${c.parsed.y} ${unit}` } }
        },
        scales: {
          x: { ticks: { color: color('--muted'), maxRotation: 0, autoSkip: true }, grid: { display: false } },
          y: { min, max, ticks: { color: color('--muted') }, grid: { color: color('--border') }, border: { display: false } }
        }
      }
    });
    return () => chart.destroy();
  }, [labels, values, unit, scheme, kind, points, min, max]);

  return <div className="chart-wrap" style={height ? { height } : undefined}><canvas ref={canvas} /></div>;
}
