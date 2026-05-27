import { useState } from 'react';
import useGraphData from './hooks/useGraphData';
import ApparatusMap from './ApparatusMap';

const DIMENSIONS = ['domain', 'function', 'phase'];

export default function App() {
  const { nodes, edges, loading, error } = useGraphData();
  const [dimension, setDimension] = useState('domain');
  const [selectedId, setSelectedId] = useState(null);

  return (
    <div className={`app ${selectedId ? 'has-detail' : ''}`}>
      <header className="topbar">
        <div className="title">
          The Apparatus
          <span className="sub">a map of authoritarian architecture</span>
        </div>
        <div className="dim-toggle" role="tablist">
          {DIMENSIONS.map((d) => (
            <button
              key={d}
              onClick={() => setDimension(d)}
              className={dimension === d ? 'active' : ''}
            >
              {d}
            </button>
          ))}
        </div>
        <div style={{ fontSize: 12, color: 'var(--fg-dim)', letterSpacing: '0.1em' }}>
          {loading ? 'loading…' : `${nodes.length} nodes · ${edges.length} edges`}
        </div>
      </header>

      <ApparatusMap
        nodes={nodes}
        edges={edges}
        dimension={dimension}
        loading={loading}
        error={error}
        selectedId={selectedId}
        onSelect={setSelectedId}
      />
    </div>
  );
}
