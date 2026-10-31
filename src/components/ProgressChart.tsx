import Chart from 'chart.js/auto';
import { useEffect, useRef, useState } from 'react';

interface Props {
  labels: string[];
  values: number[];
  unit: string;
}

/** Line chart that takes its colours from the CSS variables, and redraws when light/dark mode changes. */
export function ProgressChart({ labels, values, unit }: Props) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [scheme, setScheme] = useState(0);

  useEffect(() => {
    const mq = matchMedia('(prefers-color-scheme: dark)');
    const onChange = () => setScheme((n) => n + 1);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  useEffect(() => {
    const css = getComputedStyle(document.documentElement);
    const color = (v: string) => css.getPropertyValue(v).trim();
    const chart = new Chart(canvas.current!, {
      type: 'line',
      data: {
        labels,
        datasets: [{
          data: values,
          borderColor: color('--accent'),
          backgroundColor: color('--accent-soft'),
          pointBackgroundColor: color('--accent'),
          fill: true,
          tension: 0.3,
          pointRadius: 4,
          pointHoverRadius: 6
        }]
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
          y: { ticks: { color: color('--muted') }, grid: { color: color('--border') }, border: { display: false } }
        }
      }
    });
    return () => chart.destroy();
  }, [labels, values, unit, scheme]);

  return <div className="chart-wrap"><canvas ref={canvas} /></div>;
}
