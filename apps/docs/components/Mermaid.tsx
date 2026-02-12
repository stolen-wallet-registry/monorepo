import { useEffect, useRef, useState } from 'react';

let initialized = false;

export function Mermaid({ chart }: { chart: string }) {
  const id = useRef(`m-${Math.random().toString(36).slice(2, 9)}`);
  const [svg, setSvg] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    setError('');

    import('mermaid')
      .then(async (m) => {
        if (!initialized) {
          m.default.initialize({
            startOnLoad: false,
            theme: 'base',
            securityLevel: 'strict',
            themeVariables: {
              primaryColor: '#f0f0f0',
              primaryTextColor: '#1a1a1a',
              primaryBorderColor: '#cccccc',
              lineColor: '#666666',
              secondaryColor: '#e8e8e8',
              tertiaryColor: '#fafafa',
              noteBkgColor: '#fff8e1',
              noteTextColor: '#1a1a1a',
              noteBorderColor: '#e0c860',
              actorBkg: '#f0f0f0',
              actorTextColor: '#1a1a1a',
              actorBorder: '#cccccc',
              signalColor: '#1a1a1a',
              signalTextColor: '#1a1a1a',
            },
          });
          initialized = true;
        }

        try {
          const result = await m.default.render(id.current, chart);
          if (!cancelled) {
            setSvg(result.svg);
          }
        } catch (e) {
          console.error('Mermaid render error:', e);
          if (!cancelled) {
            setError(e instanceof Error ? e.message : 'Failed to render diagram');
          }
        } finally {
          // Clean up any temporary elements mermaid injects into the DOM
          const tempEl = document.getElementById(id.current);
          if (tempEl) tempEl.remove();
          // Clean up mermaid's temporary rendering containers.
          // Mermaid injects containers with data-processed or aria-roledescription attributes.
          // The [id^="d"][id$="mermaid"] selector targets mermaid's internal naming convention
          // (tested with mermaid 11.x). Re-verify after version upgrades.
          document
            .querySelectorAll('[id^="d"][id$="mermaid"], [data-processed="true"].mermaid')
            .forEach((el) => {
              if (
                el.textContent?.includes('Syntax error') ||
                el.textContent?.includes('mermaid version')
              ) {
                el.remove();
              }
            });
        }
      })
      .catch((e) => {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : 'Failed to load mermaid');
        }
      });

    return () => {
      cancelled = true;
    };
  }, [chart]);

  if (error) {
    return <pre style={{ color: '#c44', fontStyle: 'italic' }}>Diagram error: {error}</pre>;
  }

  if (svg) {
    return <div dangerouslySetInnerHTML={{ __html: svg }} />;
  }

  return <pre style={{ color: '#888', fontStyle: 'italic' }}>Loading diagram...</pre>;
}
